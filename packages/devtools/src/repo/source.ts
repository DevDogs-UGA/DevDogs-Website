/**
 * Loads the repo-local, never-published `@devdogsuga/*` packages devtools
 * needs at runtime: `open-graph`, `email`, `docs`. Unlike the
 * `peers.ts` set, these are `"private": true` in the target repo and never
 * reach npm — devtools resolves them straight out of the repo's own
 * `node_modules` (a pnpm workspace symlink) using the `devdogs-source`
 * export condition, picked by hand (see `resolve.ts`'s header and
 * FINDINGS.md experiment 4 for why this can't go through
 * `require.resolve`/tsx's `register({ conditions })`).
 *
 * `open-graph` and `email` both declare a `"devdogs-source"` entry in their
 * `exports["."]` map, pointing at TS source. `docs` does not (its `default`
 * points straight at a built `dist/index.js`, produced by
 * `docs-compiler`) — `resolveFromRepo` falls back to `.default` for it,
 * and routing the result through the same tsx-backed import as the other
 * two is harmless: tsx passes plain `.js` through unchanged.
 */
import { findRepoRoot } from "./root.js";
import { findDependent, resolveFromRepo } from "./resolve.js";
import { importRepoTs } from "./tsx-loader.js";

const CONDITION = "devdogs-source";

const cache = new Map<string, Promise<unknown>>();

function loadSource<T>(specifier: string): Promise<T> {
  const cached = cache.get(specifier);
  if (cached) return cached as Promise<T>;

  const promise = (async () => {
    const repoRoot = findRepoRoot();
    const resolutionBase = findDependent(repoRoot, specifier);
    if (!resolutionBase) {
      throw new Error(
        `Nothing in this repo depends on ${specifier} — expected an app or package under apps/*` +
          ` or packages/* to declare it.`,
      );
    }
    const { resolvedPath } = resolveFromRepo(
      repoRoot,
      resolutionBase,
      specifier,
      {
        condition: CONDITION,
      },
    );
    return importRepoTs<T>(resolvedPath);
  })();

  cache.set(specifier, promise);
  return promise;
}

/** Test-only: clears the memoized source modules. */
export function resetSourceCacheForTests(): void {
  cache.clear();
}

// Backstage has no copy of any of these three packages (all "private": true,
// staying in DevDogsUGA — see the ledger), so none of their real types are
// resolvable here. `open-graph-types.ts` and `email-types.ts` are
// hand-maintained mirrors of what devtools actually uses; `docs` has no
// shim at all, matching its one caller's own pre-existing inline cast
// (`docs/index-pages.ts`'s `loadPages()`).
import type { OpenGraphModule } from "../images/open-graph-types.js";
export function loadOpenGraph(): Promise<OpenGraphModule> {
  return loadSource<OpenGraphModule>("@devdogsuga/open-graph");
}

import type { EmailTemplates } from "../emails/email-types.js";
export interface EmailModule {
  render<K extends keyof EmailTemplates>(
    name: K,
    props: EmailTemplates[K],
  ): { subject: string; html: string; text: string };
}
export function loadEmail(): Promise<EmailModule> {
  return loadSource<EmailModule>("@devdogsuga/email");
}

export function loadDocs(): Promise<unknown> {
  return loadSource<unknown>("@devdogsuga/docs");
}
