/**
 * `check:toolchain`: fail when this repo's toolchain pins drift from DevDogsUGA's.
 *
 *   node scripts/toolchain-drift.ts [path-to-DevDogsUGA]   (default: devdogsuga/)
 *
 * The platform is built here, but DevDogsUGA still builds schedule-builder and
 * the database tooling with the same dependency ranges, so the two
 * pnpm-workspace.yaml files and patches/ directories are kept as copies of one
 * another until DevDogsUGA stops needing them. Silent drift is how a fix lands
 * in one repo and not the other. Hard failures:
 *
 *   - a `catalog` entry in BOTH files with different specifiers
 *   - an `overrides` key in BOTH files with different specifiers
 *   - `patchedDependencies` that are not identical (keys and patch paths)
 *   - `patches/` that is not byte-identical (every file, patches.json included)
 *
 * Entries present in only one catalog or overrides map are fine (each repo
 * carries dependencies the other does not use) and are listed as information.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type SpecifierMap = Record<string, string>;

/** Read one top-level `name:` block of key/value lines out of pnpm-workspace.yaml. */
export function parseMapBlock(yaml: string, name: string): SpecifierMap {
  const result: SpecifierMap = {};
  let inBlock = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (!inBlock) {
      inBlock = new RegExp(`^${name}:\\s*(#.*)?$`).test(line);
      continue;
    }
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) break; // next top-level key
    const match =
      /^\s+(?:'([^']+)'|"([^"]+)"|([^\s:'"]+(?:@[^\s:]+)?)):\s*(.+?)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const key = match[1] ?? match[2] ?? match[3];
    const value = stripValue(match[4] ?? "");
    if (key && value) result[key] = value;
  }
  return result;
}

/** A value without its trailing comment or surrounding quotes. */
function stripValue(raw: string): string {
  const quoted = /^(['"])(.*?)\1/.exec(raw);
  if (quoted) return quoted[2] as string;
  return raw.replace(/\s+#.*$/, "").trim();
}

export interface MapDiff {
  /** Keys in both maps with different values. */
  changed: { key: string; ours: string; theirs: string }[];
  onlyOurs: string[];
  onlyTheirs: string[];
}

export function diffMaps(ours: SpecifierMap, theirs: SpecifierMap): MapDiff {
  const keys = (map: SpecifierMap) => Object.keys(map).sort();
  return {
    changed: keys(ours)
      .filter((key) => key in theirs && ours[key] !== theirs[key])
      .map((key) => ({
        key,
        ours: ours[key] as string,
        theirs: theirs[key] as string,
      })),
    onlyOurs: keys(ours).filter((key) => !(key in theirs)),
    onlyTheirs: keys(theirs).filter((key) => !(key in ours)),
  };
}

export interface FileDiff {
  changed: string[];
  onlyOurs: string[];
  onlyTheirs: string[];
}

/** Compare two `{ filename -> content hash }` maps. */
export function diffFiles(
  ours: Record<string, string>,
  theirs: Record<string, string>,
): FileDiff {
  const names = (map: Record<string, string>) => Object.keys(map).sort();
  return {
    changed: names(ours).filter(
      (name) => name in theirs && ours[name] !== theirs[name],
    ),
    onlyOurs: names(ours).filter((name) => !(name in theirs)),
    onlyTheirs: names(theirs).filter((name) => !(name in ours)),
  };
}

export interface ToolchainInput {
  workspace: string;
  patchFiles: Record<string, string>;
}

export interface DriftReport {
  /** Hard failures, one message per problem. */
  errors: string[];
  /** Entries only one side has; never a failure. */
  info: string[];
}

export function compareToolchains(
  ours: ToolchainInput,
  theirs: ToolchainInput,
  names = { ours: "Backstage", theirs: "DevDogsUGA" },
): DriftReport {
  const errors: string[] = [];
  const info: string[] = [];

  for (const block of ["catalog", "overrides"]) {
    const diff = diffMaps(
      parseMapBlock(ours.workspace, block),
      parseMapBlock(theirs.workspace, block),
    );
    for (const { key, ours: a, theirs: b } of diff.changed) {
      errors.push(
        `${block}: ${key} is ${a} in ${names.ours} but ${b} in ${names.theirs}`,
      );
    }
    for (const key of diff.onlyOurs)
      info.push(`${block}: ${key} is only in ${names.ours}`);
    for (const key of diff.onlyTheirs)
      info.push(`${block}: ${key} is only in ${names.theirs}`);
  }

  const patched = diffMaps(
    parseMapBlock(ours.workspace, "patchedDependencies"),
    parseMapBlock(theirs.workspace, "patchedDependencies"),
  );
  for (const { key, ours: a, theirs: b } of patched.changed) {
    errors.push(
      `patchedDependencies: ${key} points at ${a} in ${names.ours} but ${b} in ${names.theirs}`,
    );
  }
  for (const key of patched.onlyOurs)
    errors.push(`patchedDependencies: ${key} is patched in ${names.ours} only`);
  for (const key of patched.onlyTheirs)
    errors.push(
      `patchedDependencies: ${key} is patched in ${names.theirs} only`,
    );

  const files = diffFiles(ours.patchFiles, theirs.patchFiles);
  for (const name of files.changed)
    errors.push(
      `patches/${name} has different contents in ${names.ours} and ${names.theirs}`,
    );
  for (const name of files.onlyOurs)
    errors.push(`patches/${name} exists only in ${names.ours}`);
  for (const name of files.onlyTheirs)
    errors.push(`patches/${name} exists only in ${names.theirs}`);

  return { errors, info };
}

export function readToolchain(root: string): ToolchainInput {
  const patchesDir = join(root, "patches");
  const patchFiles: Record<string, string> = {};
  if (existsSync(patchesDir)) {
    for (const name of readdirSync(patchesDir, { withFileTypes: true })) {
      if (!name.isFile()) continue;
      patchFiles[name.name] = createHash("sha256")
        .update(readFileSync(join(patchesDir, name.name)))
        .digest("hex");
    }
  }
  return {
    workspace: readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
    patchFiles,
  };
}

function main(): number {
  const here = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sibling = resolve(here, process.argv[2] ?? "devdogsuga");
  const inActions = process.env.GITHUB_ACTIONS === "true";
  if (!existsSync(join(sibling, "pnpm-workspace.yaml"))) {
    console.error(`toolchain: no DevDogsUGA checkout at ${sibling}.`);
    return 1;
  }

  const report = compareToolchains(readToolchain(here), readToolchain(sibling));
  for (const line of report.info) console.log(`info: ${line}`);
  for (const error of report.errors) {
    console.error(
      inActions
        ? `::error file=pnpm-workspace.yaml::${error}`
        : `error: ${error}`,
    );
  }
  if (report.errors.length > 0) {
    console.error(
      `\ntoolchain: ${report.errors.length} difference(s) from DevDogsUGA. ` +
        "Change both repos so the shared entries and patches/ match, " +
        "then update devdogsuga.lock if DevDogsUGA's side moved.",
    );
    return 1;
  }
  console.log(
    "toolchain: catalog, overrides, patchedDependencies and patches/ agree with DevDogsUGA.",
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main());
}
