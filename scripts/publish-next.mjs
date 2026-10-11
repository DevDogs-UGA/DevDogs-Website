#!/usr/bin/env node
// Prerelease publishing, driven by `.github/workflows/publish.yaml` (the
// `next` channel) from a push to `main`.
//
//   node scripts/publish-next.mjs --prepare <dir>
//   node scripts/publish-next.mjs --publish-plan <dir>/next-plan.json
//
// Every public package under packages/ (sdk, devtools, config, backstage)
// gets a prerelease on the npm `next` dist-tag whenever what it ships changed:
//
//   <next stable patch>-next.<build>      e.g. 0.1.20-next.345
//
// where "next stable patch" is one past the highest plain version on npm, so a
// prerelease sorts below the stable release it leads to and above the last one
// (semver: 0.1.20-next.345 < 0.1.20), and <build> is the workflow run number,
// which only grows. A package that has never had a stable release uses its
// committed version (0.1.0).
//
// It never touches `latest`: `npm publish --tag next` is the only form used,
// and the stable pipeline (`publish-changed-packages.mjs`) ignores prerelease
// versions when it looks for the highest published one, so the two cannot
// disturb each other.
//
// Like the stable pipeline it works in two steps so that nothing can change
// between building a candidate and publishing it: `--prepare` packs and plans
// (no network writes, no credentials); `--publish-plan` verifies the plan
// against the checkout and the artifact hashes, then publishes layer by layer
// and waits until each package is installable before its dependents go out.
//
// Dependencies between the packages are `workspace:*`, which `pnpm pack`
// rewrites to the dependency's on-disk version. So before packing a layer each
// package's on-disk version is set to what is (or is about to be) live on
// `next`, which makes a dependent's tarball name an exact prerelease of its
// dependency, and a dependency that changed forces its dependents to change
// too.

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  contentHashOfPackageDir,
  publishLayers,
  runLayers,
} from "./publish-changed-packages.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(repoRoot, "packages");

const DIST_TAG = "next";
const PLAIN = /^\d+\.\d+\.\d+$/;

// ── pure helpers ────────────────────────────────────────────────────────────

const versionKey = (v) => v.split(".").map(Number);

export function compareVersions(a, b) {
  const [x, y] = [versionKey(a), versionKey(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** The highest plain X.Y.Z in `versions`; prereleases are ignored. */
export function highestStable(versions) {
  return (
    versions
      .filter((v) => PLAIN.test(v))
      .sort(compareVersions)
      .at(-1) ?? null
  );
}

export function patchBump(version) {
  if (!PLAIN.test(version)) {
    throw new Error(`Cannot patch-bump "${version}": only plain X.Y.Z.`);
  }
  const [major, minor, patch] = versionKey(version);
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * The prerelease version to publish: one patch past the highest stable
 * release (or the committed version when there is none) plus `-next.<build>`.
 */
export function nextVersionFor({ stableVersions, committedVersion, build }) {
  if (!/^\d+$/.test(String(build))) {
    throw new Error(`The build number must be an integer, got "${build}".`);
  }
  const stable = highestStable(stableVersions);
  const base = stable
    ? patchBump(stable)
    : committedVersion.replace(/-.*$/, "");
  if (!PLAIN.test(base)) throw new Error(`"${base}" is not X.Y.Z.`);
  return `${base}-next.${build}`;
}

/** Whether `version` is a `next` prerelease this script would have made. */
export function isNextVersion(version) {
  return /^\d+\.\d+\.\d+-next\.\d+$/.test(version);
}

// ── registry ────────────────────────────────────────────────────────────────

async function fetchPackument(name) {
  const res = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    {
      headers: { "cache-control": "no-cache" },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`Registry lookup for ${name} failed: ${res.status}`);
  return res.json();
}

/** What the registry says about a package: its stable versions and the live `next`. */
export async function registryState(name, fetchPackumentImpl = fetchPackument) {
  const body = await fetchPackumentImpl(name);
  if (!body) return { stableVersions: [], next: null };
  const versions = Object.keys(body.versions ?? {});
  const nextVersion = body["dist-tags"]?.[DIST_TAG];
  const entry = nextVersion ? body.versions?.[nextVersion] : undefined;
  return {
    stableVersions: versions.filter((v) => PLAIN.test(v)),
    next: entry
      ? {
          version: nextVersion,
          shasum: entry.dist?.shasum,
          tarball: entry.dist?.tarball,
        }
      : null,
  };
}

function contentHashOfTarball(tarball) {
  const dir = mkdtempSync(join(tmpdir(), "devdogsuga-next-unpack-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", dir]);
    return contentHashOfPackageDir(join(dir, "package"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function registryContentHash(url) {
  if (!url) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "devdogsuga-next-registry-"));
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const file = join(dir, "registry.tgz");
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return contentHashOfTarball(file);
  } catch {
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitUntilInstallable(
  name,
  version,
  { timeoutMs = 15 * 60_000, intervalMs = 10_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`,
      {
        headers: {
          accept:
            "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*",
        },
      },
    );
    if (res.ok && (await res.json()).versions?.[version]) {
      console.log(`${name}@${version}: installable from the registry`);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${name}@${version} was published but is still not installable.`,
      );
    }
    console.log(`${name}@${version}: waiting for the registry CDN`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ── packages ────────────────────────────────────────────────────────────────

function readPackage(dir) {
  const path = join(dir, "package.json");
  return { path, json: JSON.parse(readFileSync(path, "utf8")) };
}

function writePackage(pkg) {
  writeFileSync(pkg.path, `${JSON.stringify(pkg.json, null, 2)}\n`);
}

export function discoverPublicPackages() {
  return readdirSync(packagesDir)
    .map((name) => join(packagesDir, name))
    .filter(
      (dir) =>
        statSync(dir).isDirectory() && existsSync(join(dir, "package.json")),
    )
    .map(readPackage)
    .filter(
      ({ json }) => json.private !== true && typeof json.name === "string",
    );
}

const sha1 = (file) =>
  createHash("sha1").update(readFileSync(file)).digest("hex");
const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

function pnpmPack(name, dest) {
  const out = execFileSync(
    "pnpm",
    ["--filter", name, "pack", "--json", "--pack-destination", dest],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  return (Array.isArray(parsed) ? parsed[0] : parsed).filename;
}

const git = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

// ── prepare ─────────────────────────────────────────────────────────────────

/**
 * Packs every public package layer by layer and decides which to publish.
 * `deps` lets a test stand in for the registry, `pnpm pack` and the clock.
 */
export async function prepare({ pkgs, outDir, build, deps }) {
  const layers = publishLayers(pkgs);
  const states = new Map();
  for (const pkg of pkgs)
    states.set(pkg.json.name, await deps.state(pkg.json.name));

  const plan = {
    schemaVersion: 1,
    channel: DIST_TAG,
    commit: deps.commit(),
    build,
    packages: [],
  };
  const tmpDirs = [];
  mkdirSync(outDir, { recursive: true });

  try {
    for (const [layerIndex, layer] of layers.entries()) {
      for (const pkg of layer) {
        const name = pkg.json.name;
        const state = states.get(name);
        const tmp = mkdtempSync(join(tmpdir(), "devdogsuga-next-"));
        tmpDirs.push(tmp);

        // Pack as the version already live on `next`: if the content is the
        // same, nothing is published and dependents keep naming this version.
        const fresh = nextVersionFor({
          stableVersions: state.stableVersions,
          committedVersion: pkg.json.version,
          build,
        });
        pkg.json.version = state.next?.version ?? fresh;
        writePackage(pkg);
        const tarball = deps.pack(name, tmp);

        if (state.next && (await deps.sameAsLive(state.next, tarball))) {
          plan.packages.push({
            name,
            layer: layerIndex,
            action: "unchanged",
            version: state.next.version,
          });
          continue;
        }

        pkg.json.version = fresh;
        writePackage(pkg);
        const final = deps.pack(name, tmp);
        const file = `${name.replaceAll("/", "-").replaceAll("@", "")}-${fresh}.tgz`;
        const destination = join(outDir, file);
        copyFileSync(final, destination);
        plan.packages.push({
          name,
          layer: layerIndex,
          action: "publish",
          version: fresh,
          file,
          sha1: sha1(destination),
          sha256: sha256(destination),
        });
        console.log(
          `${name}: ${state.next?.version ?? "(no next yet)"} -> ${fresh}`,
        );
      }
    }
  } finally {
    for (const tmp of tmpDirs) rmSync(tmp, { recursive: true, force: true });
  }
  return plan;
}

// ── publish ─────────────────────────────────────────────────────────────────

export async function publishPlan(planPath, deps) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (plan.schemaVersion !== 1 || plan.channel !== DIST_TAG) {
    throw new Error(`${planPath} is not a next-channel plan.`);
  }
  const actual = deps.commit();
  if (plan.commit !== actual) {
    throw new Error(
      `Plan commit ${plan.commit ?? "(missing)"} does not match checkout ${actual}.`,
    );
  }
  for (const entry of plan.packages) {
    if (entry.action !== "publish") continue;
    if (!isNextVersion(entry.version)) {
      throw new Error(
        `${entry.name}@${entry.version} is not a next prerelease; refusing to publish it.`,
      );
    }
    const file = join(dirname(planPath), entry.file);
    if (sha1(file) !== entry.sha1 || sha256(file) !== entry.sha256) {
      throw new Error(
        `Artifact hash mismatch for ${entry.name}@${entry.version}.`,
      );
    }
  }

  const byName = new Map(deps.packages().map((pkg) => [pkg.json.name, pkg]));
  const layers = publishLayers(
    plan.packages.map((entry) => {
      const pkg = byName.get(entry.name);
      if (!pkg) throw new Error(`Plan names unknown package ${entry.name}.`);
      return pkg;
    }),
  );
  const entries = new Map(plan.packages.map((entry) => [entry.name, entry]));
  const published = [];

  await runLayers(layers, {
    prepare: (layer, index) => {
      console.log(
        `Layer ${index}: ${layer.map((p) => p.json.name).join(", ")}`,
      );
      return layer;
    },
    run: async (pkg) => {
      const entry = entries.get(pkg.json.name);
      if (entry.action !== "publish") return;
      const live = await deps.state(entry.name);
      if (live.next?.version === entry.version) {
        if (live.next.shasum !== entry.sha1) {
          throw new Error(
            `${entry.name}@${entry.version} already exists with a different tarball.`,
          );
        }
        console.log(`${entry.name}@${entry.version}: already published.`);
      } else {
        await deps.publish(join(dirname(planPath), entry.file));
        console.log(`Published ${entry.name}@${entry.version} (${DIST_TAG})`);
      }
      await deps.waitUntilInstallable(entry.name, entry.version);
      published.push(`${entry.name}@${entry.version}`);
    },
    label: (pkg) => pkg.json.name,
  });
  return published;
}

// ── entry ───────────────────────────────────────────────────────────────────

const realDeps = {
  state: (name) => registryState(name),
  commit: () => git(["rev-parse", "HEAD"]),
  pack: (name, dest) => pnpmPack(name, dest),
  sameAsLive: async (live, tarball) =>
    (live.shasum && live.shasum === sha1(tarball)) ||
    (await registryContentHash(live.tarball)) === contentHashOfTarball(tarball),
  packages: () => discoverPublicPackages(),
  waitUntilInstallable,
  publish: async (tarball) => {
    try {
      const { stdout } = await execFileAsync(
        "npm",
        [
          "publish",
          tarball,
          "--tag",
          DIST_TAG,
          "--access",
          "public",
          "--provenance",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
      process.stdout.write(stdout);
    } catch (err) {
      process.stdout.write(String(err.stdout ?? ""));
      process.stderr.write(String(err.stderr ?? ""));
      throw err;
    }
  },
};

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main() {
  const prepareDir = optionValue("--prepare");
  const planPath = optionValue("--publish-plan");
  if (Boolean(prepareDir) === Boolean(planPath)) {
    throw new Error(
      "Use exactly one of --prepare <dir> or --publish-plan <file>.",
    );
  }

  if (planPath) {
    const published = await publishPlan(planPath, realDeps);
    console.log(
      `Published (${published.length}): ${published.join(", ") || "(none)"}`,
    );
    return;
  }

  const build = process.env.NEXT_BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER;
  if (!build)
    throw new Error(
      "Set NEXT_BUILD_NUMBER (the workflow passes GITHUB_RUN_NUMBER).",
    );
  const pkgs = discoverPublicPackages();
  const original = new Map(
    pkgs.map((pkg) => [pkg.path, readFileSync(pkg.path, "utf8")]),
  );
  try {
    const plan = await prepare({
      pkgs,
      outDir: prepareDir,
      build,
      deps: realDeps,
    });
    writeFileSync(
      join(prepareDir, "next-plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
    );
    const publishing = plan.packages.filter((p) => p.action === "publish");
    console.log(
      publishing.length > 0
        ? `Prepared ${publishing.length}: ${publishing.map((p) => `${p.name}@${p.version}`).join(", ")}`
        : "Nothing changed since the live next tags.",
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = plan.packages.map(
        (p) =>
          `| \`${p.name}\` | ${p.action} | \`${p.version}\` | ${p.sha256 ? `\`${p.sha256}\`` : "-"} |`,
      );
      writeFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          "## npm prerelease candidate",
          "",
          `Commit: \`${plan.commit}\``,
          "",
          "| Package | Action | Version | SHA-256 |",
          "| --- | --- | --- | --- |",
          ...rows,
          "",
        ].join("\n"),
        { flag: "a" },
      );
    }
  } finally {
    // Versions are written to the checkout only to pack; never leave them.
    for (const [path, contents] of original) writeFileSync(path, contents);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (err instanceof AggregateError) {
      for (const inner of err.errors)
        console.error(inner instanceof Error ? inner.message : inner);
    }
    process.exitCode = 1;
  });
}
