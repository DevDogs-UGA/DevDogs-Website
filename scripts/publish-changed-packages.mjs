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
// KNOWN v1 LIMITATION (acceptable per the build sheet's "favor obvious over
// clever", flag for Wave-3/cutover follow-up if it bites): packages are
// processed in dependency order (topological, by workspace:* edges) so a
// package publishing in the SAME run as one of its dependencies picks up
// that dependency's brand-new version. But if a package's own file contents
// are unchanged while only one of its workspace:* dependencies bumped, this
// script does NOT transitively republish it — it will keep depending on the
// dependency's previous version until something else in it changes. A
// content-only diff can't see that; catching it needs walking the
// dependency graph forward from every version bump, which is more machinery
// than a repo this size has earned yet.
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

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(repoRoot, "packages");

const dryRun = process.argv.includes("--dry-run");

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
async function fetchRegistryState(name) {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Registry lookup for ${name} failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const latest = body["dist-tags"]?.latest;
  if (!latest) return null;
  const shasum = body.versions?.[latest]?.dist?.shasum;
  return { latest, shasum };
}

function discoverPackages() {
  return readdirSync(packagesDir)
    .map((name) => join(packagesDir, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && existsSync(join(dir, "package.json"));
      } catch {
        return false;
      }
    });
}

// Order packages so a dependency is processed (and, if it changed, already
// re-versioned on disk) before anything that depends on it via workspace:*.
function topoSort(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.json.name, p]));
  const visited = new Set();
  const order = [];

  function visit(pkg, stack) {
    if (visited.has(pkg.json.name)) return;
    if (stack.has(pkg.json.name)) {
      throw new Error(`Circular workspace:* dependency involving ${pkg.json.name}`);
    }
    stack.add(pkg.json.name);
    const deps = {
      ...pkg.json.dependencies,
      ...pkg.json.devDependencies,
      ...pkg.json.peerDependencies,
    };
    for (const [depName, range] of Object.entries(deps)) {
      if (range === "workspace:*" && byName.has(depName)) {
        visit(byName.get(depName), stack);
      }
    }
    stack.delete(pkg.json.name);
    visited.add(pkg.json.name);
    order.push(pkg);
  }

  for (const pkg of pkgs) visit(pkg, new Set());
  return order;
}

async function main() {
  const pkgs = discoverPackages()
    .map((dir) => readPackageJson(dir))
    .filter(({ json }) => json.private !== true && typeof json.name === "string");

  console.log(`Found ${pkgs.length} publishable package(s): ${pkgs.map((p) => p.json.name).join(", ") || "(none)"}`);

  // Pass 1: sync every publishable package's on-disk version to its
  // latest-known-published version, so workspace:* rewrites during packing
  // (in pass 2) are never based on the stale 0.1.0 placeholder committed to
  // git.
  const registryState = new Map();
  for (const pkg of pkgs) {
    const state = await fetchRegistryState(pkg.json.name);
    registryState.set(pkg.json.name, state);
    if (state) {
      pkg.json.version = state.latest;
      writePackageJson(pkg.path, pkg.json);
    }
    // else: never published — leave the committed version (0.1.0) as-is.
  }

  // Pass 2: pack, diff against the registry shasum, bump + publish anything
  // that changed. Topological so a same-run dependency bump is visible to
  // its dependents' pack step (see the file header's known limitation for
  // what this does NOT catch).
  const ordered = topoSort(pkgs);
  const published = [];
  const unchanged = [];

  for (const pkg of ordered) {
    const name = pkg.json.name;
    const state = registryState.get(name);
    const tmp = mkdtempSync(join(tmpdir(), "devdogsuga-publish-"));
    try {
      const { shasum } = pnpmPack(repoRoot, name, tmp);

      if (state && state.shasum && state.shasum === shasum) {
        unchanged.push(name);
        continue;
      }

      const nextVersion = state ? patchBump(state.latest) : pkg.json.version;
      pkg.json.version = nextVersion;
      writePackageJson(pkg.path, pkg.json);

      // Re-pack: the tarball above still has the pre-bump version baked
      // into its package.json.
      const { tarballPath: finalTarball } = pnpmPack(repoRoot, name, tmp);

      console.log(`${name}: ${state ? state.latest : "(unpublished)"} -> ${nextVersion}`);

      if (dryRun) {
        console.log(`  [dry run] would publish ${finalTarball}`);
      } else {
        execFileSync(
          "npm",
          ["publish", finalTarball, "--access", "public", "--provenance"],
          { cwd: repoRoot, stdio: "inherit" },
        );
      }
      published.push(`${name}@${nextVersion}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("");
  console.log(`Unchanged (${unchanged.length}): ${unchanged.join(", ") || "(none)"}`);
  console.log(`${dryRun ? "Would publish" : "Published"} (${published.length}): ${published.join(", ") || "(none)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
