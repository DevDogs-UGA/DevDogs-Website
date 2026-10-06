/**
 * Loads devtools' optional-peer `@devdogsuga/*` libraries — the ones
 * published to npm and consumed by the TARGET repo, which devtools reads at
 * runtime rather than bundling its own copy of (see this package's
 * `package.json`: `peerDependencies` + `peerDependenciesMeta.optional`, and
 * `FINDINGS.md` experiment 2).
 *
 * Every export here is memoized per module (one dynamic `import()` per
 * process, not per call) — this is what makes the module-identity guarantee
 * in FINDINGS experiment 3 hold: every devtools call site that needs
 * `@devdogsuga/env`'s registry gets the exact same module instance the
 * repo's own manifests populated via `declare()`/`define()`, because both
 * resolve to the identical absolute file path and Node's ESM cache is keyed
 * by resolved URL.
 */
import { pathToFileURL } from "node:url";
import { findRepoRoot, RepoNotFoundError } from "./root.js";
import { findDependent, resolveFromRepo } from "./resolve.js";

const moduleCache = new Map<string, Promise<unknown>>();

/** The file URL each peer resolved to through the target repo, set only on
 *  that path (not on either plain bare-specifier fallback). See
 *  `repoPeerUrl()`. */
const resolvedUrls = new Map<string, string>();

/**
 * Dynamically imports `specifier` as the repo would resolve it, memoized so
 * repeated calls in one process return the SAME module instance (required
 * for the env-registry identity guarantee above).
 *
 * Falls back to a plain bare-specifier `import()` when devtools is not
 * running inside a DevDogsUGA checkout at all (`findRepoRoot()` throws
 * `RepoNotFoundError`). That is not a production affordance — under real
 * `pnpm dlx` use, `specifier` is an optional peer devtools' own package
 * never installs, so the fallback import fails with the ordinary
 * `MODULE_NOT_FOUND` either way. It exists so devtools' OWN test suite
 * (which has no target repo to discover, but does have every one of these
 * peers as a real Backstage workspace package) exercises this code against
 * the genuine package rather than needing every test to mock this module.
 */
function loadPeer<T>(specifier: string): Promise<T> {
  const cached = moduleCache.get(specifier);
  if (cached) return cached as Promise<T>;

  const promise = (async () => {
    // See `findRepoRoot()`'s own comment: Backstage's test suite sets this
    // so every peer resolves to the real Backstage-workspace copy instead
    // of a nonexistent target repo, without a per-test mock.
    if (process.env.DEVTOOLS_TEST_REPO_ROOT) {
      return import(specifier) as Promise<T>;
    }
    let repoRoot: string;
    try {
      repoRoot = findRepoRoot();
    } catch (err) {
      if (err instanceof RepoNotFoundError) {
        return import(specifier) as Promise<T>;
      }
      throw err;
    }
    const resolutionBase = findDependent(repoRoot, specifier);
    if (!resolutionBase) {
      throw new Error(
        `Nothing in this repo depends on ${specifier} — expected an app or package under apps/*` +
          ` or packages/* to declare it (dependencies/devDependencies/peerDependencies).`,
      );
    }
    const { resolvedPath } = resolveFromRepo(
      repoRoot,
      resolutionBase,
      specifier,
    );
    const url = pathToFileURL(resolvedPath).href;
    resolvedUrls.set(specifier, url);
    return import(url) as Promise<T>;
  })();

  moduleCache.set(specifier, promise);
  return promise;
}

/** Test-only: clears the memoized peer modules so a test can re-resolve with a fresh mock. */
export function resetPeerCacheForTests(): void {
  moduleCache.clear();
  resolvedUrls.clear();
}

/**
 * The file URL `specifier` was loaded from through the target repo, or
 * undefined if it has not been loaded yet or came from a plain bare-specifier
 * `import()` (the test-suite and not-in-a-repo fallbacks above).
 *
 * For code devtools imports that itself names a peer by bare specifier --
 * today only devtools' own `env.ts` manifest. From an installed copy that
 * specifier cannot resolve at all (an optional peer is never installed next
 * to devtools under `pnpm dlx`), and even where it can, the only copy that
 * keeps module identity is this one. `repo/peer-redirect.ts` uses it to
 * point the import here.
 */
export function repoPeerUrl(specifier: string): string | undefined {
  return resolvedUrls.get(specifier);
}

/**
 * Like `repoPeerUrl`, but for any specifier a package of the repo you are in
 * can resolve, subpaths included (`@devdogsuga/env/nextjs`), without having
 * loaded it. Undefined outside a real repo or when nothing depends on it.
 */
export function resolveRepoPeerUrl(specifier: string): string | undefined {
  const known = resolvedUrls.get(specifier);
  if (known) return known;
  if (process.env.DEVTOOLS_TEST_REPO_ROOT) return undefined;
  try {
    const repoRoot = findRepoRoot();
    const base = findDependent(repoRoot, specifier);
    if (!base) return undefined;
    const { resolvedPath } = resolveFromRepo(repoRoot, base, specifier);
    return pathToFileURL(resolvedPath).href;
  } catch {
    return undefined;
  }
}

// ── @devdogsuga/env ─────────────────────────────────────────────────────────
// Import types only from the bare specifier (erased at build; @devdogsuga/env
// is a Backstage devDependency purely for these types). Runtime values always
// come through the loaders below.
import type * as EnvModule from "@devdogsuga/env";
import type * as EnvLoadModule from "@devdogsuga/env/load";
import type * as EnvSessionModule from "@devdogsuga/env/session";

let resolvedEnvModule: typeof EnvModule | undefined;

export function loadEnv(): Promise<typeof EnvModule> {
  return loadPeer<typeof EnvModule>("@devdogsuga/env").then((mod) => {
    resolvedEnvModule = mod;
    return mod;
  });
}

/**
 * The synchronous companion to `loadEnv()`, for the handful of call sites
 * (`gh/environments.ts`'s `GITHUB_ENVIRONMENT_SPECS` getters) that cannot
 * become async without changing their own callers' contract — they read a
 * plain array off a getter, not a Promise. Safe ONLY after `loadEnv()` has
 * resolved at least once; every caller of these getters already requires
 * `env/discovery.ts`'s `loadRegistry()` (which calls `loadEnv()` itself) to
 * have run first, via `assertRegistryLoaded()`'s own guard.
 */
export function getEnvSync(): typeof EnvModule {
  if (!resolvedEnvModule) {
    throw new Error(
      "getEnvSync() called before loadEnv() ever resolved — call loadRegistry() " +
        "(env/discovery.ts) first.",
    );
  }
  return resolvedEnvModule;
}

/** Test-only: clears the sync cache alongside `resetPeerCacheForTests()`. */
export function resetEnvSyncCacheForTests(): void {
  resolvedEnvModule = undefined;
}

export function loadEnvLoad(): Promise<typeof EnvLoadModule> {
  return loadPeer<typeof EnvLoadModule>("@devdogsuga/env/load");
}

export function loadEnvSession(): Promise<typeof EnvSessionModule> {
  return loadPeer<typeof EnvSessionModule>("@devdogsuga/env/session");
}

// ── @devdogsuga/db ───────────────────────────────────────────────────────────
import type * as DbTypegenModule from "@devdogsuga/db/typegen";

export function loadDbTypegen(): Promise<typeof DbTypegenModule> {
  return loadPeer<typeof DbTypegenModule>("@devdogsuga/db/typegen");
}
