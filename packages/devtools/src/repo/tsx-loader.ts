/**
 * Loads the repo's own TypeScript at runtime: env manifests
 * (each app's `src/env.ts` and friends), cron contracts
 * (each app's `cloudflare/scheduled.ts`), and — via `source.ts` — the
 * `devdogs-source` condition packages (`open-graph`, `email`, `docs`).
 *
 * Uses `tsx`'s programmatic API (`register()` from `tsx/esm/api`), NOT the
 * `--conditions=devdogs-source` CLI flag the old in-repo devtools used —
 * this package ships built JS and runs from `dist/`, so there is no `tsx`
 * process wrapping it anymore (see the package README / CUTOVER note on
 * "built JS, tsx only for repo TS").
 *
 * Gotcha (FINDINGS.md experiments 3 and 4, gotcha C): do NOT pass a
 * `namespace` to `register()`. It silently breaks tsx's own relative
 * `./foo.js` → `./foo.ts` extension-fallback resolution for files loaded
 * under that registration — exactly the convention `open-graph`, `email`,
 * and any future `devdogs-source` package use for their internal relative
 * imports. `register({})` (no options) is the only form validated.
 */
import { pathToFileURL } from "node:url";

let registered = false;

/** Idempotent: registers tsx's ESM loader hooks once per process. */
async function ensureRegistered(): Promise<void> {
  if (registered) return;
  const { register } = await import("tsx/esm/api");
  // `register()`'s return value is an unregister callback (`() => Promise<void>`),
  // not something this process ever calls: the hooks stay installed for the
  // CLI's whole lifetime.
  register();
  registered = true;
}

/**
 * Imports a repo TypeScript file at an absolute path, loaded through tsx.
 * Returns the module namespace, typed as `T` by the caller (there is no way
 * to know the shape of an arbitrary repo file's exports statically here).
 */
export async function importRepoTs<T>(absolutePath: string): Promise<T> {
  await ensureRegistered();
  return import(pathToFileURL(absolutePath).href) as Promise<T>;
}
