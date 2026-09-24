/**
 * Where devtools finds the DevDogsUGA checkout it is running against.
 *
 * devtools used to live inside `packages/devtools` of that repo, so its own
 * `import.meta.url` WAS a path into the repo (`PROJECT_ROOT` /
 * `REPO_ROOT` walked up a fixed number of `..` segments from this file).
 * Published as its own package and run through `pnpm dlx`, that assumption
 * breaks: this file's `import.meta.url` points into a dlx cache directory
 * or an isolated `node_modules` tree that has nothing to do with the repo
 * the contributor is standing in.
 *
 * So repo discovery walks up from `process.cwd()` instead, looking for the
 * marker validated in the `devtools-dlx` prototype
 * (`/home/sloan/scratchpad/devdogs/prototypes/devtools-dlx/FINDINGS.md`,
 * experiment 1): a directory containing `pnpm-workspace.yaml` AND whose
 * `package.json` has `"name": "devdogs-monorepo"`. The name check is not
 * redundant — a bare `pnpm-workspace.yaml` also matches a Backstage
 * checkout (a separate pnpm workspace), which devtools should refuse
 * rather than silently "find".
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The `package.json` name every real DevDogsUGA checkout carries at its root. */
const REPO_MARKER_NAME = "devdogs-monorepo";

export class RepoNotFoundError extends Error {
  constructor() {
    super("run this from inside a DevDogsUGA clone");
    this.name = "RepoNotFoundError";
  }
}

function looksLikeRepoRoot(dir: string): boolean {
  if (!existsSync(join(dir, "pnpm-workspace.yaml"))) return false;
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name?: unknown;
    };
    return pkg.name === REPO_MARKER_NAME;
  } catch {
    return false;
  }
}

/**
 * Walks up from `startDir` (default `process.cwd()`) looking for the repo
 * marker. Returns `null` rather than throwing — `findRepoRoot()` below is
 * the throwing convenience most callers want; this is exported for callers
 * (like `setup`) that need to know without failing.
 */
export function discoverRepoRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (;;) {
    if (looksLikeRepoRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let cachedRoot: string | null | undefined;

/**
 * The memoized, throwing repo-root lookup. Lazy on purpose: importing this
 * module must never fail just because nothing has called it yet (`setup`
 * and `completions` in `launch.ts` never need a repo at all, and must stay
 * that way — see that file's header comment on why).
 *
 * Resolved once per process: `process.cwd()` does not change mid-invocation
 * for this CLI, and re-walking the filesystem on every call would be pure
 * waste.
 */
export function findRepoRoot(): string {
  if (cachedRoot === undefined) {
    // Backstage's own test suite has no DevDogsUGA checkout to discover —
    // it IS a different pnpm workspace — but most of devtools' unit tests
    // exercise code that calls `findRepoRoot()` only to build a path string
    // that a mocked `node:fs/promises` never actually reads. Rather than
    // adding a `vi.mock("../repo/root.js", ...)` to every one of those
    // files, `vitest.config.ts` sets this one env var for the whole run so
    // `findRepoRoot()` resolves to a stable fake path instead of throwing.
    // A test that specifically wants the real "not in a repo" refusal
    // (`RepoNotFoundError`) unsets it locally — see `root.test.ts`.
    cachedRoot = process.env.DEVTOOLS_TEST_REPO_ROOT ?? discoverRepoRoot();
  }
  if (cachedRoot === null) {
    throw new RepoNotFoundError();
  }
  return cachedRoot;
}

/** Test-only: clears the memoized root so a test can point `process.cwd()` elsewhere. */
export function resetRepoRootCacheForTests(): void {
  cachedRoot = undefined;
}
