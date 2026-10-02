#!/usr/bin/env node
// Auto patch-bump + publish of the DevDogs Workshops VS Code extension to the
// Marketplace, driven by the `extension` job of `.github/workflows/publish.yaml`.
// The extension version-bumping counterpart of publish-changed-packages.mjs:
//
//   1. Find the last release: the highest git tag `workshops-vscode@X.Y.Z`.
//      Its annotation carries `content-hash: <sha256>`, the hash of what was
//      published. (A git tag rather than the Marketplace's copy: the
//      Marketplace re-serves a repackaged, signed .vsix that would need the
//      same normalising, needs a network read that can lag a publish, and
//      isn't ours; the tag is written by this script only after the
//      Marketplace accepted the upload.)
//   2. Build the bundle (the Sentry DSN comes in through
//      WORKSHOPS_VSCODE_SENTRY_DSN) and package it with `vsce package` at the
//      last released version, then hash the .vsix's CONTENTS: every file's
//      path and bytes, with the version inside package.json normalised and the
//      manifest and zip timestamps left out, so the hash moves only when
//      something shipped changed.
//   3. Same hash as the last release: nothing to do. Different (or no release
//      yet): bump one patch past the last release (the committed version,
//      0.1.0, for the first), repackage, `vsce publish --packagePath` that
//      exact file, then tag and create a GitHub release.
//
// VSCE_PAT (an Azure DevOps token scoped to Marketplace: Manage) is the only
// credential. Without it the run says so and stops: a fork, or a repo where the
// secret isn't set yet, should not fail.
//
//   node scripts/publish-workshops-vscode.mjs [--dry-run]
//
// `--dry-run` packages and hashes and says what it would do; it needs neither
// the token nor network, and writes no tag.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const extDir = join(repoRoot, "apps/workshops-vscode");
const pkgPath = join(extDir, "package.json");
const TAG_PREFIX = "workshops-vscode@";

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

export function patchBump(version) {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(
      `Refusing to patch-bump non-plain-semver version "${version}".`,
    );
  }
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
}

/**
 * Hash of a .vsix's contents. `entries` is [path, Buffer] for every file in it.
 * The version-bearing manifest and the content-types file are left out (the
 * manifest restates package.json, and package.json is in), and package.json's
 * version is normalised, so a version bump alone never changes the hash.
 */
export function hashEntries(entries) {
  const lines = [];
  for (const [path, bytes] of entries) {
    if (path === "extension.vsixmanifest" || path === "[Content_Types].xml")
      continue;
    let content = bytes;
    if (path === "extension/package.json") {
      content = Buffer.from(
        JSON.stringify({
          ...JSON.parse(bytes.toString("utf8")),
          version: "0.0.0",
        }),
      );
    }
    lines.push(
      `${path}\0${createHash("sha256").update(content).digest("hex")}`,
    );
  }
  return createHash("sha256").update(lines.sort().join("\n")).digest("hex");
}

function readVsix(file) {
  const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
    .split("\n")
    .filter((n) => n && !n.endsWith("/"));
  return names.map((name) => [
    name,
    execFileSync("unzip", ["-p", file, name.replace(/[[\]*?\\]/g, "\\$&")], {
      maxBuffer: 256 * 1024 * 1024,
    }),
  ]);
}

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8", ...options });
const git = (...args) => run("git", args).trim();

/** The highest `workshops-vscode@X.Y.Z` tag and the hash in its annotation, or null. */
function lastRelease() {
  const tag = git("tag", "--list", `${TAG_PREFIX}*`, "--sort=-v:refname")
    .split("\n")
    .find((t) => /^workshops-vscode@\d+\.\d+\.\d+$/.test(t));
  if (!tag) return null;
  const message = git("tag", "--list", tag, "--format=%(contents)");
  return {
    tag,
    version: tag.slice(TAG_PREFIX.length),
    hash: /^content-hash: ([0-9a-f]{64})$/m.exec(message)?.[1] ?? null,
  };
}

function writeVersion(version) {
  const json = JSON.parse(readFileSync(pkgPath, "utf8"));
  json.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`);
}

function pack(version, dir) {
  writeVersion(version);
  const out = join(dir, `workshops-${version}.vsix`);
  run(
    "pnpm",
    [
      "--filter",
      "workshops",
      "exec",
      "vsce",
      "package",
      "--no-dependencies",
      "--out",
      out,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prepareDir = optionValue("--prepare");
  const publishPlanPath = optionValue("--publish-plan");
  if (prepareDir && publishPlanPath) {
    throw new Error("Use either --prepare or --publish-plan, not both.");
  }
  if (publishPlanPath) {
    await publishPreparedPlan(publishPlanPath);
    return;
  }
  if (!dryRun && !prepareDir && !process.env.VSCE_PAT) {
    console.log(
      "::notice title=Marketplace publish skipped::VSCE_PAT is not set, so the extension was not published.",
    );
    return;
  }

  const last = lastRelease();
  console.log(last ? `Last release: ${last.tag}` : "No release yet.");
  const dir = mkdtempSync(join(tmpdir(), "workshops-vscode-"));
  const committed = JSON.parse(readFileSync(pkgPath, "utf8")).version;
  try {
    // The bundle doesn't contain its own version, so it is built once.
    run(
      "pnpm",
      ["--filter", "workshops", "exec", "node", "esbuild.mjs", "--minify"],
      { stdio: ["ignore", "inherit", "inherit"] },
    );

    const baseline = pack(last?.version ?? committed, dir);
    const hash = hashEntries(readVsix(baseline));
    console.log(`Content hash: ${hash}`);
    if (last?.hash === hash) {
      console.log("Unchanged since the last release; nothing to publish.");
      if (prepareDir) {
        mkdirSync(prepareDir, { recursive: true });
        writeFileSync(
          join(prepareDir, "extension-plan.json"),
          `${JSON.stringify({ schemaVersion: 1, commit: git("rev-parse", "HEAD"), action: "unchanged", version: last.version, contentHash: hash }, null, 2)}\n`,
        );
      }
      return;
    }

    let version = last ? patchBump(last.version) : committed;
    if (prepareDir) {
      mkdirSync(prepareDir, { recursive: true });
      const vsix = pack(version, dir);
      const filename = `workshops-${version}.vsix`;
      const destination = join(prepareDir, filename);
      copyFileSync(vsix, destination);
      const artifactHash = createHash("sha256")
        .update(readFileSync(destination))
        .digest("hex");
      const plan = {
        schemaVersion: 1,
        commit: git("rev-parse", "HEAD"),
        action: "publish",
        version,
        file: filename,
        contentHash: hash,
        sha256: artifactHash,
      };
      writeFileSync(
        join(prepareDir, "extension-plan.json"),
        `${JSON.stringify(plan, null, 2)}\n`,
      );
      console.log(`Prepared ${destination}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        writeFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          [
            "## VS Code release candidate",
            "",
            `Commit: \`${plan.commit}\``,
            `Version: \`${version}\``,
            `Content hash: \`${hash}\``,
            `Artifact SHA-256: \`${artifactHash}\``,
            "",
          ].join("\n"),
          { flag: "a" },
        );
      }
      return;
    }
    for (let attempt = 1; ; attempt++) {
      const vsix = pack(version, dir);
      console.log(
        `workshops ${last?.version ?? "(unpublished)"} -> ${version}`,
      );
      if (dryRun) {
        console.log(
          `[dry run] would publish ${vsix}, then tag ${TAG_PREFIX}${version}`,
        );
        return;
      }
      try {
        // VSCE_PAT is read from the environment by vsce.
        run(
          "pnpm",
          [
            "--filter",
            "workshops",
            "exec",
            "vsce",
            "publish",
            "--no-dependencies",
            "--packagePath",
            vsix,
          ],
          { stdio: ["ignore", "inherit", "pipe"] },
        );
        break;
      } catch (error) {
        const stderr = String(error.stderr ?? "");
        process.stderr.write(stderr);
        // The Marketplace already has this version (a run whose tag never landed).
        if (!/already exists|version.*exists/i.test(stderr) || attempt >= 5)
          throw error;
        version = patchBump(version);
      }
    }

    const tag = `${TAG_PREFIX}${version}`;
    git(
      "tag",
      "-a",
      tag,
      "-m",
      `DevDogs Workshops ${version}\n\ncontent-hash: ${hash}`,
    );
    git("push", "origin", `refs/tags/${tag}`);
    run(
      "gh",
      [
        "release",
        "create",
        tag,
        "--verify-tag",
        "--title",
        tag,
        "--latest=false",
        "--notes",
        `Marketplace: https://marketplace.visualstudio.com/items?itemName=devdogsuga.workshops\n\nContent hash: \`${hash}\``,
      ],
      { stdio: "inherit" },
    );
    console.log(`Published ${tag}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    // The version bump is for the package only; never leave it in the working tree.
    writeVersion(committed);
  }
}

function ensureExtensionRelease(version, contentHash) {
  const tag = `${TAG_PREFIX}${version}`;
  const tags = git("tag", "--list", tag);
  if (tags === tag) return;
  git(
    "tag",
    "-a",
    tag,
    "-m",
    `DevDogs Workshops ${version}\n\ncontent-hash: ${contentHash}`,
  );
  git("push", "origin", `refs/tags/${tag}`);
  run(
    "gh",
    [
      "release",
      "create",
      tag,
      "--verify-tag",
      "--title",
      tag,
      "--latest=false",
      "--notes",
      `Marketplace: https://marketplace.visualstudio.com/items?itemName=devdogsuga.workshops\n\nContent hash: \`${contentHash}\``,
    ],
    { stdio: "inherit" },
  );
}

async function publishPreparedPlan(path) {
  if (!process.env.VSCE_PAT) {
    console.log(
      "::notice title=Marketplace publish skipped::VSCE_PAT is not set, so the prepared extension was not published.",
    );
    return;
  }
  const plan = JSON.parse(readFileSync(path, "utf8"));
  const actualCommit = git("rev-parse", "HEAD");
  if (plan.schemaVersion !== 1 || plan.commit !== actualCommit) {
    throw new Error(
      `Release plan commit ${plan.commit ?? "(missing)"} does not match checkout ${actualCommit}.`,
    );
  }
  if (plan.action === "unchanged") return;
  const vsix = join(dirname(path), plan.file);
  const artifactHash = createHash("sha256")
    .update(readFileSync(vsix))
    .digest("hex");
  if (
    artifactHash !== plan.sha256 ||
    hashEntries(readVsix(vsix)) !== plan.contentHash
  ) {
    throw new Error(
      `Artifact hash mismatch for workshops-vscode@${plan.version}.`,
    );
  }
  const existing = lastRelease();
  if (existing?.version === plan.version) {
    if (existing.hash !== plan.contentHash) {
      throw new Error(
        `${TAG_PREFIX}${plan.version} exists with a different content hash.`,
      );
    }
    console.log(`${TAG_PREFIX}${plan.version}: already published.`);
    return;
  }
  run(
    "pnpm",
    [
      "--filter",
      "workshops",
      "exec",
      "vsce",
      "publish",
      "--no-dependencies",
      "--packagePath",
      vsix,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  ensureExtensionRelease(plan.version, plan.contentHash);
  console.log(`Published ${TAG_PREFIX}${plan.version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
