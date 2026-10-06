/**
 * Which repo the CLIs are standing in, and where each kind of file lives.
 *
 * Both CLIs (`devtools`, `backstage`) run from `pnpm dlx … latest` in two
 * different repos at once:
 *
 *  - **DevDogsUGA** (`devdogs-monorepo`): `supabase/`, `packages/supabase`,
 *    `docs/`, schedule-builder and study-group-finder. Until the cutover it
 *    also carries `apps/platform` and `workers.json`; afterwards it carries
 *    neither.
 *  - **Backstage** (`backstage`): the platform (`apps/platform`), the CLIs and
 *    `workers.json`. DevDogsUGA is reached through `<root>/devdogsuga`, a
 *    gitignored symlink to the sibling clone locally (`scripts/devdogsuga.mjs`)
 *    and a real checkout at the pinned SHA in CI.
 *
 * Every path that used to be "the repo root" is one of these, and they only
 * agree in DevDogsUGA:
 *
 * | what                                                   | where                          |
 * | ------------------------------------------------------ | ------------------------------ |
 * | `supabase/` (CLI cwd, config, migrations, seeds,       | `devdogsugaRoot`               |
 * |   avatars, env manifest), `database.types.ts`, `docs/` |                                |
 * | `workers.json`, `.github/`                             | `root` (the repo you are in)   |
 * | `apps/*`                                               | `root`, then `devdogsugaRoot`  |
 * | `.env`, `.env.<tier>`, `.env.generated`                | `root`; writers mirror into    |
 * |                                                        | `envMirrors` (see below)       |
 *
 * **Env files.** Each repo's apps read env files at THEIR repo root through
 * `@devdogsuga/env` (`with-env` walks up for `pnpm-workspace.yaml`): the
 * platform and the Backstage CLIs at Backstage's root, schedule-builder inside
 * `devdogsuga/` at that checkout's root. So in a Backstage layout the primary
 * file is `<root>/.env.<tier>`, and the commands that write a file nothing else
 * owns (`deploy write-env`, the local stack's `.env.generated`) also write the
 * same bytes into every directory in `envMirrors` (`[devdogsugaRoot]`).
 * Commands that edit a contributor's own file (`env pull|push|reset`) do not
 * mirror: that file may hold local overrides, and DevDogsUGA's own clone can
 * run the same command against its own root.
 *
 * `appsDirs`, `listApps` and `resolveAppPath` give the union of both repos'
 * apps; on a name clash the repo you are in wins (before the cutover the
 * sibling still has its own `apps/platform`, which must not be scanned too).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { findRepoRoot } from "./root.js";

export type RepoKind = "devdogsuga" | "backstage";

/** The `package.json` name of a Backstage checkout's root. */
export const BACKSTAGE_ROOT_NAME = "backstage";

/** The directory (relative to a Backstage root) holding the DevDogsUGA checkout. */
export const DEVDOGSUGA_LINK = "devdogsuga";

export interface RepoLayout {
  kind: RepoKind;
  /** The repo being run from; what `findRepoRoot()` returns. */
  root: string;
  /**
   * Where DevDogsUGA's files live: `root` itself in DevDogsUGA, `<root>/devdogsuga`
   * in Backstage. A GETTER in the Backstage case: reading it throws
   * `DevdogsugaMissingError` when the checkout is absent, so commands that
   * never touch DevDogsUGA's files keep working without one.
   */
  readonly devdogsugaRoot: string;
  /** `root` when `kind` is `"backstage"`, otherwise undefined. */
  backstageRoot?: string;
  /** False only for a Backstage layout whose `devdogsuga/` is missing. */
  hasDevdogsuga: boolean;
  /** Existing `apps/` directories, repo-you-are-in first. */
  appsDirs: string[];
  /** Directories an env-file writer must copy its file into besides `root`. */
  envMirrors: string[];
}

export class DevdogsugaMissingError extends Error {
  constructor(path: string) {
    super(
      `The DevDogsUGA checkout is missing at ${path}. Run \`pnpm devdogsuga\` ` +
        "(links the sibling clone, or $DEVDOGSUGA_DIR) or `pnpm install` in " +
        "the Backstage root first.",
    );
    this.name = "DevdogsugaMissingError";
  }
}

/** The kind of repo `dir` is the root of, by its `package.json` name; null if neither. */
export function repoKindOf(dir: string): RepoKind | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name?: unknown;
    };
    if (pkg.name === "devdogs-monorepo") return "devdogsuga";
    if (pkg.name === BACKSTAGE_ROOT_NAME) return "backstage";
  } catch {
    // not a repo root
  }
  return null;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The layout of the repo rooted at `root`. Pure: nothing is memoized, so tests
 * can build fixtures freely. An unrecognised package name is treated as
 * DevDogsUGA (the contract fixtures and every pre-Backstage caller).
 */
export function layoutAt(root: string): RepoLayout {
  const kind: RepoKind =
    repoKindOf(root) === "backstage" ? "backstage" : "devdogsuga";
  const sibling = join(root, DEVDOGSUGA_LINK);
  const hasDevdogsuga = kind === "devdogsuga" || isDir(sibling);
  const devdogsugaRoot = kind === "devdogsuga" ? root : sibling;
  const appsDirs = [join(root, "apps")];
  if (kind === "backstage" && hasDevdogsuga) {
    appsDirs.push(join(devdogsugaRoot, "apps"));
  }
  const layout: RepoLayout = {
    kind,
    root,
    get devdogsugaRoot(): string {
      if (!hasDevdogsuga) throw new DevdogsugaMissingError(sibling);
      return devdogsugaRoot;
    },
    ...(kind === "backstage" ? { backstageRoot: root } : {}),
    hasDevdogsuga,
    appsDirs: appsDirs.filter(isDir),
    envMirrors: kind === "backstage" && hasDevdogsuga ? [devdogsugaRoot] : [],
  };
  return layout;
}

/** `layout.devdogsugaRoot`, or null instead of a throw when the checkout is missing. */
export function devdogsugaRootOrNull(layout: RepoLayout): string | null {
  return layout.hasDevdogsuga ? layout.devdogsugaRoot : null;
}

let cached: RepoLayout | undefined;
let cachedFor: string | undefined;

/** The layout of the repo the process is in (`findRepoRoot()`), memoized per root. */
export function resolveLayout(): RepoLayout {
  const root = findRepoRoot();
  if (cached === undefined || cachedFor !== root) {
    cached = layoutAt(root);
    cachedFor = root;
  }
  return cached;
}

/** Test-only: forget the memoized layout. */
export function resetLayoutCacheForTests(): void {
  cached = undefined;
  cachedFor = undefined;
}

export interface LayoutApp {
  name: string;
  /** Absolute directory of the app. */
  dir: string;
}

/** Every directory under `appsDirs` (one app each), de-duplicated by name, sorted by name. */
export function listApps(layout: RepoLayout = resolveLayout()): LayoutApp[] {
  const seen = new Map<string, LayoutApp>();
  for (const parent of layout.appsDirs) {
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (!seen.has(entry.name)) {
        seen.set(entry.name, {
          name: entry.name,
          dir: join(parent, entry.name),
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The directory of the app called `name`, or undefined when no repo has it. */
export function findApp(
  name: string,
  layout: RepoLayout = resolveLayout(),
): string | undefined {
  return listApps(layout).find((app) => app.name === name)?.dir;
}

/**
 * Resolves a workspace-relative path such as `workers.json`'s
 * `apps/schedule-builder` to a directory: the repo you are in first, then
 * DevDogsUGA's. When neither has it the first candidate is returned, so
 * callers get an ordinary ENOENT naming the path rather than a second error.
 */
export function resolveAppPath(
  relative: string,
  layout: RepoLayout = resolveLayout(),
): string {
  const first = join(layout.root, relative);
  if (existsSync(first)) return first;
  if (layout.kind === "backstage" && layout.hasDevdogsuga) {
    const second = join(layout.devdogsugaRoot, relative);
    if (existsSync(second)) return second;
  }
  return first;
}

/**
 * The directory of the app called `name`. With an explicit `root` (tests,
 * `--root`) that is `<root>/apps/<name>` and nothing else; without one it is
 * wherever the layout finds the app, defaulting to the repo you are in.
 */
export function appDirFor(name: string, root?: string): string {
  if (root !== undefined) return join(root, "apps", name);
  return findApp(name) ?? join(resolveLayout().root, "apps", name);
}

/**
 * The pnpm workspace root holding the app called `name`: where
 * `pnpm --filter <name>` has to run. DevDogsUGA's root for its apps seen from a
 * Backstage checkout, `layout.root` otherwise.
 */
export function appWorkspaceRoot(
  name: string,
  layout: RepoLayout = resolveLayout(),
): string {
  const dir = findApp(name, layout);
  return dir === undefined ? layout.root : dirname(dirname(dir));
}

/** The base name of a workspace-relative path (`apps/platform` to `platform`). */
export function appNameOf(relative: string): string {
  return basename(relative);
}
