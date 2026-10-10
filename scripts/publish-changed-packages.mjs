#!/usr/bin/env node
// Auto patch-bump + publish, driven by `.github/workflows/publish.yaml`.
//
// WHAT THIS DOES (v1, deliberately simple — see the workflow header for the
// full set of prerequisites this cannot verify itself until the npm org and
// GitHub remote exist):
//
//   1. For every non-private package under packages/*, ask the npm registry
//      what's currently published (dist-tags.latest + that version's tarball
//      shasum). A 404 means "never published".
//   2. Write that latest-published version (or, if never published, the
//      version already in package.json — 0.1.0 per the ledger) into the
//      package's on-disk package.json. This is a SYNC step, not a bump: it
//      exists so that `workspace:*` dependencies between Backstage packages
//      resolve, at pack time, to the version that's actually live on the
//      registry rather than the placeholder committed in git (every
//      migrated package's committed version stays 0.1.0 forever — this
//      pipeline is the only thing that ever writes a different number, and
//      it never commits that write; see the build sheet, "Versions stay
//      0.1.0").
//   3. Pack each package (`pnpm pack`, which does the workspace:* → real
//      version rewrite natively) and compare its shasum to the registry's.
//      Same shasum → package is unchanged since its last publish → skip.
//      Different shasum (or never published) → this package changed →
//      bump ONE patch version past the latest known-published version (or
//      publish at 0.1.0 for a first-ever publish), re-pack with that
//      version baked in, and publish the resulting tarball.
//   4. Publish via the plain `npm` CLI (not `pnpm publish`), specifically so
//      that OIDC trusted publishing — which is an npm-CLI/npm-registry
//      protocol, not a pnpm one — is the thing authenticating. pnpm only
//      does the workspace-aware packing here; npm does the actual registry
//      write. No npm token of any kind is read or expected to exist.
//
// ORDER AND CONCURRENCY. Packages are grouped into topological LAYERS (see
// publishLayers): a package's layer is one past the deepest in-repo public
// package it needs installed, where "needs" means `dependencies`,
// `optionalDependencies` and `peerDependencies` declared as `workspace:*`
// (what a consumer's install resolves). `devDependencies` are NOT edges:
// consumers never install them, so waiting on one only slows the run. The
// `*`-ranged optional peers (db/env on the CLIs) are not workspace ranges and
// are not edges either; the consumer's own repo supplies those.
//
// Layer by layer: pack and version every package of the layer (serially, see
// the PACKING note), then publish them all concurrently, then wait for every
// one of them to be installable (waitUntilInstallable, concurrently), then
// start the next layer. So a package is only ever published once everything
// it depends on is installable, which is the guarantee the 2026-10-04 CDN
// race (see waitUntilInstallable) needs, without serialising unrelated
// packages. If any publish or wait in a layer fails, siblings already in
// flight finish (npm publishes can't be cancelled), the next layer never
// starts, and the error lists what did publish.
//
// PACKING stays serial on purpose. `pnpm pack` runs through execFileSync, so
// it blocks the event loop and never overlaps with itself or with the
// package.json writes around it; that is the whole synchronisation story, and
// it keeps every write to an on-disk package.json strictly before any pack
// that reads it. Packing is seconds per package; the minutes live in the
// network publish and the CDN wait, which are the parts that run concurrently.
//
// One consequence of dropping devDependency edges: `pnpm pack` still writes a
// package's workspace devDependencies into the tarball's manifest at their
// on-disk versions. If a package's devDependency bumps in the same run, the
// tarball carries the previous version of it, and the next run (which syncs
// the new version first) sees a different tarball and republishes that
// package once more. That is one extra patch release, never a broken one.
//
// KNOWN v1 LIMITATION (acceptable per the build sheet's "favor obvious over
// clever", flag for Wave-3/cutover follow-up if it bites): if a package's own
// file contents are unchanged while only one of its workspace:* dependencies
// bumped, this script does NOT transitively republish it, except through the
// pack-comparison above for packages that happen to be packed after the bump.
// It will keep depending on the dependency's previous version until something
// else in it changes. Catching it needs walking the dependency graph forward
// from every version bump, which is more machinery than a repo this size has
// earned yet.
//
// Requires network access to registry.npmjs.org (read, unauthenticated) and
// an npm CLI new enough to speak OIDC trusted publishing (the workflow pins
// one explicitly — see its comments).
//
// SHASUM NOTE: `pnpm pack --json` (as of pnpm 12.4.2, verified empirically —
// see the scaffold-stage notes) does not report a shasum, so this script
// hashes the tarball itself with sha1 (the same algorithm the registry's
// `dist.shasum` uses) to compare against it. That only works because pnpm's
// packer is byte-deterministic for identical content — verified empirically:
// packing the same source twice, seconds apart, produces byte-identical
// tarballs (no embedded timestamp). If a future pnpm version starts
// stamping tarballs with the pack time, this comparison always "changes"
// and every package republishes on every merge — noisy but not unsafe.

import { execFile, execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(repoRoot, "packages");

const dryRun = process.argv.includes("--dry-run");

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const prepareDir = optionValue("--prepare");
const publishPlanPath = optionValue("--publish-plan");

if (prepareDir && publishPlanPath) {
  throw new Error("Use either --prepare or --publish-plan, not both.");
}

function readPackageJson(dir) {
  const path = join(dir, "package.json");
  return { path, json: JSON.parse(readFileSync(path, "utf8")) };
}

function writePackageJson(path, json) {
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function sha1OfFile(path) {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A deep copy with every object's keys sorted, so key order hashes alike. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

/**
 * What a package ships, as one hash: every file's path and bytes, except that
 * the top-level package.json is compared without its `version` and with its
 * keys sorted.
 *
 * ⚠️ Why not the tarball's shasum alone: `pnpm pack` does not write the
 * rewritten `workspace:`/`catalog:` dependencies in a stable order, so two
 * packs of the same source can differ by nothing but key order. Comparing
 * shasums republished devtools 0.1.47 through 0.1.50 with identical contents,
 * each asking for a publish approval.
 */
export function contentHashOfPackageDir(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(dir, path).split("\\").join("/"));
    }
  };
  walk(dir);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    let bytes = readFileSync(join(dir, file));
    if (file === "package.json") {
      const { version: _version, ...json } = JSON.parse(bytes.toString("utf8"));
      bytes = Buffer.from(JSON.stringify(canonical(json)));
    }
    hash.update(`${file}\0`).update(bytes).update("\0");
  }
  return hash.digest("hex");
}

/** `contentHashOfPackageDir` for a packed `.tgz`. */
function contentHashOfTarball(tarball) {
  const dir = mkdtempSync(join(tmpdir(), "devdogsuga-unpack-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", dir]);
    return contentHashOfPackageDir(join(dir, "package"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The content hash of a published tarball, or undefined if it cannot be read. */
async function registryContentHash(url) {
  if (!url) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "devdogsuga-registry-"));
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const tarball = join(dir, "registry.tgz");
    writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
    return contentHashOfTarball(tarball);
  } catch {
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// pnpm --filter <name> pack --json prints one array entry per selected
// package (exactly one, given an exact --filter match); `filename` is
// already an absolute path when --pack-destination is absolute.
function pnpmPack(repoRoot, name, destDir) {
  const out = execFileSync(
    "pnpm",
    ["--filter", name, "pack", "--json", "--pack-destination", destDir],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  return { tarballPath: entry.filename, shasum: sha1OfFile(entry.filename) };
}

function patchBump(version) {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(
      `Refusing to patch-bump non-plain-semver version "${version}" — this pipeline only understands X.Y.Z.`,
    );
  }
  const [major, minor, patch] = parts.map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

// Unauthenticated, read-only. Returns null for "never published".
//
// `latest` is the highest published X.Y.Z, not dist-tags.latest: the two
// only differ if someone moved the tag by hand, and bumping past the highest
// is what avoids a version collision. The registry's packument can still lag
// a publish by minutes (it's CDN-cached), so publishing also retries on a
// collision; see publishWithRetry.
async function fetchRegistryState(name) {
  const res = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    {
      headers: { "cache-control": "no-cache" },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Registry lookup for ${name} failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.json();
  const latest = highestVersion(Object.keys(body.versions ?? {}));
  if (!latest) return null;
  const shasum = body.versions[latest].dist?.shasum;
  const tarball = body.versions[latest].dist?.tarball;
  return { latest, shasum, tarball };
}

// Block until installers can resolve name@version. fetchRegistryState asks
// for the full packument with the cache bypassed; installers don't. pnpm
// requests the abbreviated "install-v1" packument through the CDN, a
// separately cached document that can keep serving the old version list for
// minutes after a publish. That window broke a DevDogsUGA production deploy
// (2026-10-04): it installed @devdogsuga/backstage@0.1.12, published 6s after
// @devdogsuga/newsletter@0.1.14, while the CDN still said newsletter's latest
// was 0.1.13. Waiting here for every package of a layer before the next
// layer starts means a dependency is installable before anything depending on
// it is published, and a finished publish job means everything it published is
// installable.
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
    if (res.ok) {
      const body = await res.json();
      if (body.versions?.[version]) {
        console.log(`${name}@${version}: installable from the registry`);
        return;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${name}@${version} was published but installers still cannot resolve it after ${timeoutMs / 60_000} minutes.`,
      );
    }
    console.log(`${name}@${version}: waiting for the registry CDN to catch up`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function highestVersion(versions) {
  const plain = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const key = (v) => v.split(".").map(Number);
  plain.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return plain.at(-1) ?? null;
}

// npm answers 403 "cannot publish over the previously published versions"
// when the version already exists, which happens when the registry read in
// pass 1 was stale. Bump past it and re-pack rather than failing the run.
async function publishWithRetry(repoRoot, pkg, tarball, destDir, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      const { stdout } = await execFileAsync(
        "npm",
        ["publish", tarball, "--access", "public", "--provenance"],
        { cwd: repoRoot, encoding: "utf8" },
      );
      process.stdout.write(stdout);
      return pkg.json.version;
    } catch (err) {
      const stderr = String(err.stderr ?? "");
      process.stderr.write(stderr);
      if (
        !/cannot publish over the previously published version/i.test(stderr) ||
        i >= attempts
      ) {
        throw err;
      }
      const taken = pkg.json.version;
      pkg.json.version = patchBump(taken);
      writePackageJson(pkg.path, pkg.json);
      // Synchronous, so it cannot overlap another package's pack or write.
      tarball = pnpmPack(repoRoot, pkg.json.name, destDir).tarballPath;
      console.log(
        `${pkg.json.name}: ${taken} is already published; retrying as ${pkg.json.version}`,
      );
    }
  }
}

function discoverPackages() {
  return readdirSync(packagesDir)
    .map((name) => join(packagesDir, name))
    .filter((dir) => {
      try {
        return (
          statSync(dir).isDirectory() && existsSync(join(dir, "package.json"))
        );
      } catch {
        return false;
      }
    });
}

const EDGE_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * Names of the in-repo public packages `pkg` needs installed: its workspace
 * ranges in dependencies, optionalDependencies and peerDependencies. Not
 * devDependencies (consumers never install them), and not `*`-ranged peers
 * (those are supplied by the consumer's repo, not this one's publish).
 */
export function publishEdges(pkg, byName) {
  const edges = new Set();
  for (const field of EDGE_FIELDS) {
    for (const [depName, range] of Object.entries(pkg.json[field] ?? {})) {
      if (
        typeof range === "string" &&
        range.startsWith("workspace:") &&
        byName.has(depName)
      ) {
        edges.add(depName);
      }
    }
  }
  return [...edges].sort();
}

/**
 * Group packages into publish layers: layer N holds every package whose
 * deepest dependency chain is N long, so everything in a layer can publish at
 * once and a layer only needs the layers before it. Sorted by name inside a
 * layer so the order (and the release plan) is deterministic.
 */
export function publishLayers(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.json.name, p]));
  const depth = new Map();

  function visit(pkg, stack) {
    const name = pkg.json.name;
    if (depth.has(name)) return depth.get(name);
    if (stack.includes(name)) {
      throw new Error(
        `Circular workspace dependency: ${[...stack, name].join(" -> ")}`,
      );
    }
    stack.push(name);
    let layer = 0;
    for (const dep of publishEdges(pkg, byName)) {
      layer = Math.max(layer, visit(byName.get(dep), stack) + 1);
    }
    stack.pop();
    depth.set(name, layer);
    return layer;
  }

  for (const pkg of pkgs) visit(pkg, []);
  const layers = [];
  for (const pkg of pkgs) {
    (layers[depth.get(pkg.json.name)] ??= []).push(pkg);
  }
  return layers.map((layer) =>
    layer.sort((a, b) => a.json.name.localeCompare(b.json.name)),
  );
}

/**
 * Walk the layers in order. For each: `prepare(layer, index)` (optional; sync
 * or async, run alone) turns the layer's packages into jobs, then `run(job)`
 * executes every job concurrently. The layer is done only when all its jobs
 * have settled; if any failed, later layers never start and the thrown error
 * says which jobs completed, which failed and which never started. `label`
 * names a job in that message. Resolves to every job's result, in layer order.
 */
export async function runLayers(
  layers,
  { prepare = (layer) => layer, run, label = String },
) {
  const completed = [];
  const results = [];
  for (const [index, layer] of layers.entries()) {
    const jobs = await prepare(layer, index);
    const settled = await Promise.allSettled(jobs.map((job) => run(job)));
    const failures = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") {
        completed.push(label(jobs[i]));
        results.push(outcome.value);
      } else {
        failures.push({ job: label(jobs[i]), reason: outcome.reason });
      }
    });
    if (failures.length > 0) {
      const skipped = layers
        .slice(index + 1)
        .flat()
        .map((pkg) => pkg.json?.name ?? String(pkg));
      throw new AggregateError(
        failures.map((f) => f.reason),
        [
          `Layer ${index} failed: ${failures
            .map(
              (f) =>
                `${f.job} (${f.reason instanceof Error ? f.reason.message : f.reason})`,
            )
            .join("; ")}.`,
          `Completed before stopping (${completed.length}): ${completed.join(", ") || "(none)"}.`,
          `Not started (${skipped.length}): ${skipped.join(", ") || "(none)"}.`,
        ].join("\n"),
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// GitHub releases, one per published version, tagged `<name>@<version>`
// (e.g. `@devdogsuga/devtools@0.1.5`). Created right after the npm publish,
// on the commit this run checked out.
//
// ensureRelease is idempotent and also runs for UNCHANGED packages: if the
// version npm has as latest has no release yet, it gets one. That backfills
// packages published before this existed, and it repairs a run where npm
// accepted the publish but the release step then failed (the next run sees
// the package unchanged and creates the missing release). An unchanged
// package's tarball matches this commit, so tagging it here is accurate.
//
// Needs `gh` and GH_TOKEN with contents: write (see publish.yaml), and the
// full history and tags for the notes (fetch-depth: 0).
// ---------------------------------------------------------------------------

const RELEASE_NOTES_MAX_COMMITS = 50;

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function releaseExists(tag) {
  try {
    execFileSync("gh", ["release", "view", tag, "--json", "tagName"], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    return true;
  } catch (err) {
    if (/release not found/i.test(String(err.stderr ?? ""))) return false;
    throw err;
  }
}

function releaseNotes(pkg, version) {
  const name = pkg.json.name;
  const dir = relative(repoRoot, dirname(pkg.path));
  const previous = git([
    "tag",
    "--list",
    `${name}@*`,
    "--sort=-v:refname",
    "--merged",
    "HEAD",
  ])
    .split("\n")
    .find((tag) => tag && tag !== `${name}@${version}`);
  const range = previous ? [`${previous}..HEAD`] : [];
  const commits = git(["log", "--format=- %s (%h)", ...range, "--", dir])
    .split("\n")
    .filter(Boolean);
  const shown = commits.slice(0, RELEASE_NOTES_MAX_COMMITS);
  if (commits.length > shown.length) {
    shown.push(`- …and ${commits.length - shown.length} earlier commits`);
  }
  return [
    `npm: https://www.npmjs.com/package/${name}/v/${version}`,
    "",
    previous
      ? `Changes to \`${dir}\` since ${previous}:`
      : `Changes to \`${dir}\`:`,
    "",
    ...(shown.length
      ? shown
      : ["- No changes to the package's own files (a dependency was bumped)."]),
  ].join("\n");
}

function ensureRelease(pkg, version) {
  const tag = `${pkg.json.name}@${version}`;
  if (dryRun) {
    console.log(`  [dry run] would ensure GitHub release ${tag}`);
    return;
  }
  if (releaseExists(tag)) return;
  execFileSync(
    "gh",
    [
      "release",
      "create",
      tag,
      "--target",
      git(["rev-parse", "HEAD"]),
      "--title",
      tag,
      "--notes",
      releaseNotes(pkg, version),
      // Several packages share one repo; "Latest" on whichever published last
      // would mean nothing.
      "--latest=false",
    ],
    { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] },
  );
  console.log(`  GitHub release ${tag}`);
}

async function main() {
  // `private: true` is what keeps `@devdogsuga/cli-core` off npm: the CLIs
  // inline it with tsdown, so it is never published and never versioned here.
  // `@devdogsuga/backstage` is public, so a first run finds it unpublished and
  // publishes it at its committed 0.1.0 (the first publish is done by hand
  // to set up Trusted Publishing; later runs patch-bump it like the rest).
  const pkgs = discoverPackages()
    .map((dir) => readPackageJson(dir))
    .filter(
      ({ json }) => json.private !== true && typeof json.name === "string",
    );
  const originalPackageFiles = new Map(
    pkgs.map((pkg) => [pkg.path, readFileSync(pkg.path, "utf8")]),
  );

  console.log(
    `Found ${pkgs.length} publishable package(s): ${pkgs.map((p) => p.json.name).join(", ") || "(none)"}`,
  );

  // Pass 1: sync every publishable package's on-disk version to its
  // latest-known-published version, so workspace:* rewrites during packing
  // (in pass 2) are never based on the stale 0.1.0 placeholder committed to
  // git. Registry reads are independent, so they run together; the writes
  // happen after, one at a time.
  const registryState = new Map();
  const states = await Promise.all(
    pkgs.map((pkg) => fetchRegistryState(pkg.json.name)),
  );
  // Each latest tarball's content hash, for the comparison in pass 2. A
  // download that fails leaves it undefined, and only the shasum is compared.
  await Promise.all(
    states.map(async (state) => {
      if (state) state.contentHash = await registryContentHash(state.tarball);
    }),
  );
  pkgs.forEach((pkg, i) => {
    const state = states[i];
    registryState.set(pkg.json.name, state);
    if (state) {
      pkg.json.version = state.latest;
      writePackageJson(pkg.path, pkg.json);
    }
    // else: never published — leave the committed version (0.1.0) as-is.
  });

  // Pass 2, layer by layer (see the file header): pack, diff against the
  // registry shasum and bump every package of the layer; then publish the
  // changed ones concurrently and wait for all of them to be installable
  // before the next layer packs, so a dependent's pack step sees its
  // dependencies' final versions.
  const layers = publishLayers(pkgs);
  const published = [];
  const unchanged = [];
  const plan = {
    schemaVersion: 2,
    commit: git(["rev-parse", "HEAD"]),
    packages: [],
  };
  const tmpDirs = [];

  if (prepareDir) mkdirSync(prepareDir, { recursive: true });

  function prepareLayer(layer, layerIndex) {
    console.log(
      `Layer ${layerIndex}: ${layer.map((p) => p.json.name).join(", ")}`,
    );
    const jobs = [];
    for (const pkg of layer) {
      const name = pkg.json.name;
      const state = registryState.get(name);
      const tmp = mkdtempSync(join(tmpdir(), "devdogsuga-publish-"));
      tmpDirs.push(tmp);
      const { shasum, tarballPath } = pnpmPack(repoRoot, name, tmp);

      if (
        state &&
        ((state.shasum && state.shasum === shasum) ||
          (state.contentHash &&
            state.contentHash === contentHashOfTarball(tarballPath)))
      ) {
        unchanged.push(name);
        plan.packages.push({
          name,
          layer: layerIndex,
          action: "unchanged",
          version: state.latest,
          registryShasum: state.shasum,
          // Read now so the workflow can skip the approval-gated publish job
          // when nothing would change: an unchanged package still costs that
          // job a GitHub release backfill when its release is missing.
          ...(prepareDir
            ? { releaseMissing: !releaseExists(`${name}@${state.latest}`) }
            : {}),
        });
        if (!prepareDir) {
          jobs.push({ pkg, version: state.latest, tarball: null, tmp });
        }
        continue;
      }

      const nextVersion = state ? patchBump(state.latest) : pkg.json.version;
      pkg.json.version = nextVersion;
      writePackageJson(pkg.path, pkg.json);

      // Re-pack: the tarball above still has the pre-bump version baked
      // into its package.json.
      const { tarballPath: finalTarball } = pnpmPack(repoRoot, name, tmp);

      console.log(
        `${name}: ${state ? state.latest : "(unpublished)"} -> ${nextVersion}`,
      );

      if (prepareDir) {
        const filename = `${name.replaceAll("/", "-").replaceAll("@", "")}-${nextVersion}.tgz`;
        const destination = join(prepareDir, filename);
        copyFileSync(finalTarball, destination);
        plan.packages.push({
          name,
          layer: layerIndex,
          action: "publish",
          version: nextVersion,
          file: filename,
          sha1: sha1OfFile(destination),
          sha256: sha256OfFile(destination),
        });
        console.log(`  prepared ${destination}`);
        published.push(`${name}@${nextVersion}`);
      } else {
        jobs.push({ pkg, version: nextVersion, tarball: finalTarball, tmp });
      }
    }
    return jobs;
  }

  async function runJob(job) {
    const { pkg, tarball, tmp } = job;
    const name = pkg.json.name;
    if (tarball === null) {
      ensureRelease(pkg, job.version);
      return;
    }
    let version = job.version;
    if (dryRun) {
      console.log(`  [dry run] would publish ${tarball}`);
    } else {
      version = await publishWithRetry(repoRoot, pkg, tarball, tmp);
      await waitUntilInstallable(name, version);
    }
    published.push(`${name}@${version}`);
    ensureRelease(pkg, version);
  }

  try {
    await runLayers(layers, {
      prepare: prepareLayer,
      run: runJob,
      label: (job) => job.pkg?.json.name ?? String(job),
    });
  } catch (err) {
    console.error("");
    console.error(
      `Published before the failure (${published.length}): ${published.join(", ") || "(none)"}`,
    );
    throw err;
  } finally {
    for (const tmp of tmpDirs) rmSync(tmp, { recursive: true, force: true });
  }

  console.log("");
  console.log(
    `Unchanged (${unchanged.length}): ${unchanged.join(", ") || "(none)"}`,
  );
  console.log(
    `${prepareDir ? "Prepared" : dryRun ? "Would publish" : "Published"} (${published.length}): ${published.join(", ") || "(none)"}`,
  );

  if (prepareDir) {
    const path = join(prepareDir, "npm-plan.json");
    writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = plan.packages.map(
        (entry) =>
          `| \`${entry.name}\` | ${entry.action} | \`${entry.version}\` | ${entry.sha256 ? `\`${entry.sha256}\`` : "—"} |`,
      );
      writeFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          "## npm release candidate",
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
    for (const [path, contents] of originalPackageFiles) {
      writeFileSync(path, contents);
    }
  }
}

async function publishPreparedPlan(path) {
  const plan = JSON.parse(readFileSync(path, "utf8"));
  const actualCommit = git(["rev-parse", "HEAD"]);
  if (plan.schemaVersion !== 2 || plan.commit !== actualCommit) {
    throw new Error(
      `Release plan commit ${plan.commit ?? "(missing)"} does not match checkout ${actualCommit}.`,
    );
  }
  const packages = new Map(
    discoverPackages()
      .map((dir) => readPackageJson(dir))
      .filter(({ json }) => typeof json.name === "string")
      .map((pkg) => [pkg.json.name, pkg]),
  );

  // The plan was made from this same commit, so the layers it recorded must be
  // the ones this checkout computes. Checked before anything is published.
  const layers = publishLayers(
    plan.packages.map((entry) => {
      const pkg = packages.get(entry.name);
      if (!pkg)
        throw new Error(`Release plan names unknown package ${entry.name}.`);
      return pkg;
    }),
  );
  for (const [index, layer] of layers.entries()) {
    for (const pkg of layer) {
      const entry = plan.packages.find((e) => e.name === pkg.json.name);
      if (entry.layer !== index) {
        throw new Error(
          `Release plan puts ${entry.name} in layer ${entry.layer}, but this checkout computes layer ${index}.`,
        );
      }
    }
  }

  // Every artifact is verified before the first publish, so a corrupted or
  // swapped tarball fails the run with nothing published.
  const entries = new Map(plan.packages.map((entry) => [entry.name, entry]));
  for (const entry of plan.packages) {
    if (entry.action === "unchanged") continue;
    const tarball = join(dirname(path), entry.file);
    if (
      sha1OfFile(tarball) !== entry.sha1 ||
      sha256OfFile(tarball) !== entry.sha256
    ) {
      throw new Error(
        `Artifact hash mismatch for ${entry.name}@${entry.version}.`,
      );
    }
  }

  async function publishEntry(pkg) {
    const entry = entries.get(pkg.json.name);
    if (entry.action === "unchanged") {
      ensureRelease(pkg, entry.version);
      return;
    }
    const tarball = join(dirname(path), entry.file);
    const live = await fetchRegistryState(entry.name);
    if (live?.latest === entry.version) {
      if (live.shasum !== entry.sha1) {
        throw new Error(
          `${entry.name}@${entry.version} already exists with a different tarball.`,
        );
      }
      console.log(
        `${entry.name}@${entry.version}: already published; repairing release metadata.`,
      );
    } else {
      if (
        live &&
        highestVersion([live.latest, entry.version]) !== entry.version
      ) {
        throw new Error(
          `${entry.name}: registry advanced to ${live.latest}; prepare a new candidate instead of recalculating after approval.`,
        );
      }
      const { stdout } = await execFileAsync(
        "npm",
        ["publish", tarball, "--access", "public", "--provenance"],
        { cwd: repoRoot, encoding: "utf8" },
      ).catch((err) => {
        process.stdout.write(String(err.stdout ?? ""));
        process.stderr.write(String(err.stderr ?? ""));
        throw err;
      });
      process.stdout.write(stdout);
      console.log(`Published ${entry.name}@${entry.version}`);
    }
    // Also on the "already published" path: a re-run after a failure must not
    // go on to publish dependents of a version installers can't see yet.
    await waitUntilInstallable(entry.name, entry.version);
    ensureRelease(pkg, entry.version);
  }

  await runLayers(layers, {
    prepare: (layer, index) => {
      console.log(
        `Layer ${index}: ${layer.map((p) => p.json.name).join(", ")}`,
      );
      return layer;
    },
    run: publishEntry,
    label: (pkg) => pkg.json.name,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const operation = publishPlanPath
    ? publishPreparedPlan(publishPlanPath)
    : main();
  operation.catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
