#!/usr/bin/env node
// Prints the directory of each workspace package named on the command line and
// of every workspace package they depend on, transitively, one per line.
//
//   node scripts/workspace-closure.mjs @devdogsuga/devtools @devdogsuga/cli-core
//
// CI uses it to decide whether a change can affect the Windows job: the job
// installs devtools, cli-core and what they import, so the paths to watch come
// from the dependency graph instead of a list that goes stale when one gains a
// dependency. It reads package.json files only, so it needs no install.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** Every package.json under `packages/` and `apps/`, as `{ name, dir, deps }`. */
export function workspacePackages(root) {
  const found = [];
  for (const group of ["packages", "apps"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const file = join(base, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, "utf8"));
      const deps = new Set();
      for (const field of DEP_FIELDS) {
        for (const [name, range] of Object.entries(json[field] ?? {})) {
          if (String(range).startsWith("workspace:")) deps.add(name);
        }
      }
      found.push({
        name: json.name,
        dir: relative(root, dirname(file)).split("\\").join("/"),
        deps,
      });
    }
  }
  return found;
}

/** The directories of `names` and everything they depend on, sorted. */
export function closure(packages, names) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const seen = new Set();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    const pkg = byName.get(name);
    if (!pkg) throw new Error(`No workspace package named ${name}.`);
    seen.add(name);
    queue.push(...pkg.deps);
  }
  return [...seen].map((name) => byName.get(name).dir).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error("Usage: workspace-closure.mjs <package-name>...");
    process.exit(2);
  }
  console.log(closure(workspacePackages(root), names).join("\n"));
}
