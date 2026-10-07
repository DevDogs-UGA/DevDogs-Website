/**
 * `check scripts`: the package-script vocabulary, enforced.
 *
 * One vocabulary across both repos, so `pnpm -F <app> <task>` and
 * `pnpm -r run <task>` mean the same thing everywhere:
 *
 *   dev, build, start, preview, typecheck, lint, lint:fix, format:check,
 *   format:write, test, test:watch, test:<kind>, check:<what>
 *
 * and the generated-file families:
 *
 *   codegen        gitignored, derived from the repo, run automatically
 *   types:<source> committed types (plus types:<source>:check, drift-checked)
 *   fetch:<what>   committed, fetched from outside, by hand
 *   populate:<what> writes derived or external data into the database
 *
 * `pre<name>`/`post<name>` of any allowed name is allowed (the few genuinely
 * generated inputs run from pre-scripts, since there is no task runner), as
 * are the npm lifecycle scripts. Beyond naming, `lint` needs a `lint:fix`
 * beside it and a Vitest `test` needs a `test:watch`.
 *
 * The root package also carries the CLI runners (`devtools`, `backstage`).
 *
 * A repo can allow a name outside the vocabulary, with a reason, in the root
 * `package.json`: `"devdogs": { "scriptExceptions": { "<package>#<script>":
 * "<why>" } }`, where `<package>` is the package's name (`root` for the root
 * package). The exception also covers the script's `pre`/`post` hooks.
 * Exceptions that match no script are themselves a problem, so the list
 * cannot rot.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expandWorkspacePackages, workspaceGlobs } from "./workers.js";

const FIXED = new Set([
  "dev",
  "build",
  "start",
  "preview",
  "typecheck",
  "lint",
  "lint:fix",
  "format:check",
  "format:write",
  "test",
  "test:watch",
  "codegen",
]);

/** Families: a fixed prefix then a lowercase-kebab suffix, with `types:` also
 * allowing the `:check` drift script. */
const FAMILIES: readonly RegExp[] = [
  /^test:[a-z][a-z0-9-]*$/,
  /^check:[a-z][a-z0-9-]*$/,
  /^types:[a-z][a-z0-9-]*(:check)?$/,
  /^fetch:[a-z][a-z0-9-]*$/,
  /^populate:[a-z][a-z0-9-]*$/,
];

/** npm's own lifecycle names, which are not ours to rename. */
const LIFECYCLE = new Set([
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "prepublishOnly",
  "publish",
  "version",
]);

/** Present in the vocabulary's spirit but banned by name: each has a
 * replacement the message points at. */
const BANNED: Readonly<Record<string, string>> = {
  "test:coverage": "drop it; coverage runs from `test`'s own config",
  "cf:preview": "use `preview`",
  "cf:build": "use `build` (the tier comes from DEPLOY_ENV)",
  "cf:typegen": "use `types:cf`",
};

const ROOT_ONLY = new Set(["devtools", "backstage"]);

function isAllowedName(name: string): boolean {
  return FIXED.has(name) || FAMILIES.some((family) => family.test(name));
}

/** `<package>#<script>` to the reason it is allowed, from the root manifest. */
export type ScriptExceptions = Readonly<Record<string, string>>;

export function isAllowedScript(name: string, isRoot = false): boolean {
  if (BANNED[name] || name.startsWith("cf:")) return false;
  if (LIFECYCLE.has(name)) return true;
  if (isRoot && ROOT_ONLY.has(name)) return true;
  if (isAllowedName(name)) return true;
  const pre = /^(pre|post)(.+)$/.exec(name);
  return pre?.[2] !== undefined && isAllowedName(pre[2]);
}

export interface ScriptPackage {
  /** Workspace-relative directory; `.` for the root. */
  dir: string;
  /** The package's `name`, which `pnpm -F` takes. Absent if it has none. */
  name?: string;
  scripts: Readonly<Record<string, string>>;
}

/** One readable line per violation. Empty means the vocabulary holds. */
export function checkScriptVocabulary(
  packages: readonly ScriptPackage[],
  exceptions: ScriptExceptions = {},
): string[] {
  const problems: string[] = [];
  const used = new Set<string>();
  for (const { dir, name: packageName, scripts } of packages) {
    const names = Object.keys(scripts);
    const owner = dir === "." ? "root" : packageName;
    for (const name of names) {
      if (isAllowedScript(name, dir === ".")) continue;
      const hooked = /^(?:pre|post)(.+)$/.exec(name)?.[1];
      const excepted = [name, hooked].find(
        (candidate) => candidate && `${owner}#${candidate}` in exceptions,
      );
      if (excepted) {
        used.add(`${owner}#${excepted}`);
        continue;
      }
      const replacement = BANNED[name];
      problems.push(
        `${dir}: script "${name}" is not in the vocabulary` +
          (replacement ? ` (${replacement}).` : "."),
      );
    }
    if (names.includes("lint") && !names.includes("lint:fix")) {
      problems.push(`${dir}: has "lint" but no "lint:fix".`);
    }
    if (
      /\bvitest\b/.test(scripts.test ?? "") &&
      !names.includes("test:watch")
    ) {
      problems.push(`${dir}: runs Vitest in "test" but has no "test:watch".`);
    }
  }
  for (const key of Object.keys(exceptions)) {
    if (used.has(key)) continue;
    // An exception for a script that is now in the vocabulary, or gone, is
    // stale: only the unused-because-absent case is knowable here.
    const present = packages.some(
      ({ dir, name, scripts }) =>
        `${dir === "." ? "root" : name}#` ===
          key.slice(0, key.indexOf("#") + 1) &&
        key.slice(key.indexOf("#") + 1) in scripts,
    );
    if (!present)
      problems.push(`scriptExceptions: "${key}" matches no script.`);
  }
  return problems;
}

/** The root and every workspace package's scripts. */
export function readScriptPackages(root: string): ScriptPackage[] {
  const read = (dir: string): ScriptPackage | null => {
    const file = join(root, dir, "package.json");
    if (!existsSync(file)) return null;
    const pkg = JSON.parse(readFileSync(file, "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    return {
      dir,
      ...(pkg.name ? { name: pkg.name } : {}),
      scripts: pkg.scripts ?? {},
    };
  };

  const workspace = join(root, "pnpm-workspace.yaml");
  const dirs = existsSync(workspace)
    ? expandWorkspacePackages(
        root,
        workspaceGlobs(readFileSync(workspace, "utf8")),
      )
    : [];
  return [".", ...dirs]
    .map(read)
    .filter((pkg): pkg is ScriptPackage => pkg !== null);
}

/** The root manifest's `devdogs.scriptExceptions`, empty when it has none. */
export function readScriptExceptions(root: string): ScriptExceptions {
  const file = join(root, "package.json");
  if (!existsSync(file)) return {};
  const manifest = JSON.parse(readFileSync(file, "utf8")) as {
    devdogs?: { scriptExceptions?: ScriptExceptions };
  };
  return manifest.devdogs?.scriptExceptions ?? {};
}

export function checkScripts(root: string): string[] {
  return checkScriptVocabulary(
    readScriptPackages(root),
    readScriptExceptions(root),
  );
}
