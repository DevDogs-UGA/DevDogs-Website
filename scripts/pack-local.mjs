#!/usr/bin/env node
// Builds every publishable package and `pnpm pack`s each one into a stable,
// gitignored tarball under `.packs/` at the repo root — e.g.
// `.packs/devdogsuga-db.tgz` for `@devdogsuga/db`. Filenames carry no
// version and this script overwrites them on every run, so `.packs/` always
// holds exactly the current working tree, packed.
//
// WHY THIS EXISTS: Backstage has no GitHub remote yet and none of its eight
// (soon nine) packages has ever been published to npm — see CUTOVER.md,
// section A. Until that first publish exists, `DevDogsUGA` cannot depend on
// these packages by version. Instead, per CUTOVER.md's "local-pack bridge"
// note, the product repo points pnpm `overrides` (or a `file:` /
// `link:`-style dependency) at these tarballs, e.g.:
//
//   "pnpm": {
//     "overrides": {
//       "@devdogsuga/db": "file:../Backstage/.packs/devdogsuga-db.tgz"
//     }
//   }
//
// WHY A TARBALL, NOT A `workspace:*`/`link:` reference: `pnpm pack` rewrites
// every `catalog:` and `workspace:*` specifier in the packed package.json
// into the real, resolved version — the exact same rewrite npm's registry
// would see on a real publish. A `link:`/`workspace:` dependency would skip
// that rewrite and let an un-packable specifier leak into the product repo's
// install, silently hiding a problem the first real publish would surface.
// Packing locally is the only way to test "does this look like what npm
// would actually serve" without publishing anything.
//
// Requires each publishable package's `build` script to have already
// produced `dist/` — see the "Build every publishable package" step below;
// `pnpm pack` only pack whats already in `files` on disk.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, existsSync, statSync, renameSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(repoRoot, "packages");
const packsDir = join(repoRoot, ".packs");

function readPackageJson(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
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

// "@devdogsuga/db" -> "devdogsuga-db.tgz". Stable and predictable so a
// consumer (or this script's own docs) can reference a tarball by name
// without reading `.packs/` first.
function tarballName(pkgName) {
  return `${pkgName.replace(/^@/, "").replace(/\//g, "-")}.tgz`;
}

function main() {
  const pkgs = discoverPackages()
    .map((dir) => ({ dir, json: readPackageJson(dir) }))
    .filter(({ json }) => json.private !== true && typeof json.name === "string");

  console.log(
    `Found ${pkgs.length} publishable package(s): ${pkgs.map((p) => p.json.name).join(", ") || "(none)"}`,
  );

  console.log("Build (workspace)…");
  execFileSync("pnpm", ["-r", "--if-present", "run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  mkdirSync(packsDir, { recursive: true });

  for (const { json } of pkgs) {
    const name = json.name;
    console.log(`Packing ${name}…`);
    const out = execFileSync(
      "pnpm",
      ["--filter", name, "pack", "--json", "--pack-destination", packsDir],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const dest = join(packsDir, tarballName(name));
    // pnpm names the tarball with the resolved version baked in
    // (devdogsuga-db-0.1.0.tgz); rename to the stable, version-free name so
    // repeated runs overwrite in place instead of accumulating one tarball
    // per version ever packed.
    renameSync(entry.filename, dest);
    console.log(`  -> ${dest}`);
  }

  console.log(`Done. ${pkgs.length} tarball(s) in ${packsDir}.`);
}

main();
