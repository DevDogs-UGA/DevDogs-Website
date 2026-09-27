/**
 * Enough of the pnpm workspace to check a documented command against, read
 * straight off the filesystem.
 *
 * Deliberately not a YAML library: this package declares no YAML dependency,
 * and every workspace file this monorepo writes shares one mechanical shape —
 * `packages:` followed by a list of quoted, single-star globs — so a
 * hand-rolled reader is a dozen lines instead of a new dependency. A glob this
 * repo has never written (nested, unquoted, a second key before the list
 * ends) is read as "no more packages" rather than guessed at.
 *
 * Separate from `gen/program.ts`'s own `findRepoRoot`/target discovery on
 * purpose: that module pulls in the TypeScript compiler, which the bare mode
 * — the one thing every `pnpm dev` and `pnpm build` runs — has no use for.
 * `command-check.ts` runs in the bare mode, so it needs a walk that costs
 * nothing to import.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface WorkspacePackage {
  /** `package.json`'s own "name", falling back to the directory's name. */
  name: string;
  /** Repo-relative, posix-separated: `apps/platform`. */
  dir: string;
  scripts: ReadonlySet<string>;
}

/** Walks up from `from` until it finds `pnpm-workspace.yaml`, or gives up. */
export function findWorkspaceRoot(from: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The globs under `packages:` in `pnpm-workspace.yaml`, in file order. */
function readGlobs(repoRoot: string): string[] {
  const text = fs.readFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    "utf-8",
  );
  const globs: string[] = [];
  let inPackages = false;

  for (const line of text.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;

    const item = /^\s*-\s*["']?([^"'\s#]+)["']?\s*$/.exec(line);
    if (item) {
      globs.push(item[1]!);
      continue;
    }
    if (line.trim() === "") continue;
    break; // the next top-level key ends the list.
  }

  return globs;
}

/** Reads one package's name and scripts. `dir` is filled in by the caller. */
function readPackage(absDir: string): Omit<WorkspacePackage, "dir"> | null {
  const manifestPath = path.join(absDir, "package.json");
  if (!fs.existsSync(manifestPath)) return null;

  let manifest: { name?: unknown; scripts?: unknown };
  try {
    manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8"),
    ) as typeof manifest;
  } catch {
    return null;
  }

  const scripts =
    typeof manifest.scripts === "object" && manifest.scripts !== null
      ? Object.keys(manifest.scripts as Record<string, unknown>)
      : [];

  return {
    name:
      typeof manifest.name === "string" ? manifest.name : path.basename(absDir),
    scripts: new Set(scripts),
  };
}

/** Every package under a `<dir>/*` glob in `pnpm-workspace.yaml`. */
export function discoverWorkspacePackages(
  repoRoot: string,
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];

  for (const glob of readGlobs(repoRoot)) {
    const match = /^([^*]+)\/\*$/.exec(glob);
    if (match === null) continue; // only the single-star, one-level form is used here.

    const parent = path.join(repoRoot, match[1]!);
    if (!fs.statSync(parent, { throwIfNoEntry: false })?.isDirectory()) continue;

    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkg = readPackage(path.join(parent, entry.name));
      if (pkg !== null) {
        packages.push({ ...pkg, dir: `${match[1]}/${entry.name}` });
      }
    }
  }

  return packages;
}

/** The workspace root's own `package.json`, for a bare `pnpm run <script>`. */
export function readRootPackage(repoRoot: string): WorkspacePackage | null {
  const pkg = readPackage(repoRoot);
  return pkg === null ? null : { ...pkg, dir: "." };
}

/** `apps/<slug>` package.jsons, keyed by the slug — a docs project's name. */
export function appPackagesBySlug(
  packages: readonly WorkspacePackage[],
): Map<string, WorkspacePackage> {
  const byApp = new Map<string, WorkspacePackage>();
  for (const pkg of packages) {
    if (pkg.dir.startsWith("apps/")) byApp.set(pkg.dir.slice("apps/".length), pkg);
  }
  return byApp;
}
