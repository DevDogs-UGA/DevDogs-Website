/**
 * The one list of Worker apps, read from root `workers.json`.
 *
 * Six call sites across `devtools` and `env` used to carry their own copy of
 * `["platform", "sandbox", "schedule-builder"]` — a CLI's app-choice list, a
 * deploy guard, an env-registry consumer, a cron drift test, and more — with
 * nothing to say when one of them drifted from the rest. `workers.test.ts`
 * covers the drift; this module is the one place to fix it.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { findRepoRoot } from "./repo/root.js";

// Both lists used to be top-level `const`s, evaluated the instant this
// module was imported — which meant `findRepoRoot()` ran (and threw
// `RepoNotFoundError`) at IMPORT time for anything that pulled this module
// in transitively, `devtools --help` and `devtools setup` included, even
// outside any repo. Lazy + memoized getters fix that: nothing here touches
// the filesystem until a caller actually asks for the list, by which point
// it is a real repo-dependent command that is supposed to refuse outside a
// repo anyway.
let cachedWorkerPaths: readonly string[] | undefined;

/** Workspace-relative paths, exactly as listed in root `workers.json`. */
export function workerPaths(): readonly string[] {
  if (cachedWorkerPaths === undefined) {
    cachedWorkerPaths = JSON.parse(
      readFileSync(join(findRepoRoot(), "workers.json"), "utf8"),
    ) as readonly string[];
  }
  return cachedWorkerPaths;
}

/** Basenames, e.g. `"schedule-builder"` — the `pnpm --filter` / CLI slug. */
export function workerApps(): readonly string[] {
  return workerPaths().map((path) => basename(path));
}

export function isWorkerApp(value: string): boolean {
  return workerApps().includes(value);
}
