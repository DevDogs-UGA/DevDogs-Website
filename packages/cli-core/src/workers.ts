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
let cachedWorkerEntries: readonly WorkerEntry[] | undefined;

/**
 * One app in `workers.json`. An entry is a workspace-relative path, or an
 * object carrying the path and whatever per-app data the deploy commands read
 * (`smoke`, for `backstage deploy smoke`; validated by the command that reads
 * it, not here).
 */
export interface WorkerEntry {
  path: string;
  smoke?: unknown;
}

/**
 * Normalizes the parsed JSON of `workers.json`: bare path strings and
 * `{ path, smoke? }` objects may be mixed, so the file can grow per-app data
 * without every reader changing the day it does.
 */
export function parseWorkerEntries(json: unknown): WorkerEntry[] {
  if (!Array.isArray(json)) {
    throw new Error("workers.json must be an array.");
  }
  return json.map((entry: unknown, index): WorkerEntry => {
    if (typeof entry === "string") return { path: entry };
    if (
      typeof entry === "object" &&
      entry !== null &&
      "path" in entry &&
      typeof entry.path === "string"
    ) {
      return "smoke" in entry
        ? { path: entry.path, smoke: entry.smoke }
        : { path: entry.path };
    }
    throw new Error(
      `workers.json entry ${index} must be a path string or an object with a "path".`,
    );
  });
}

/** Every entry in root `workers.json`. */
export function workerEntries(): readonly WorkerEntry[] {
  cachedWorkerEntries ??= parseWorkerEntries(
    JSON.parse(readFileSync(join(findRepoRoot(), "workers.json"), "utf8")),
  );
  return cachedWorkerEntries;
}

/** Workspace-relative paths, exactly as listed in root `workers.json`. */
export function workerPaths(): readonly string[] {
  return workerEntries().map((entry) => entry.path);
}

/** Basenames, e.g. `"schedule-builder"` — the `pnpm --filter` / CLI slug. */
export function workerApps(): readonly string[] {
  return workerPaths().map((path) => basename(path));
}

export function isWorkerApp(value: string): boolean {
  return workerApps().includes(value);
}
