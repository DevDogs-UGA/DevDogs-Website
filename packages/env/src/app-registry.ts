/**
 * Loads an app's own manifest so `with-env --worker` can scope the Worker env.
 *
 * The registry fills as a side effect of importing the manifest, and it must
 * be the SAME `@devdogsuga/env` instance the manifest's `declare()` calls hit,
 * which is the copy resolved from the manifest, not this package's own
 * (running from source under tsx, those are different files). So the registry
 * is read back from that copy.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkerEnvRegistry } from "./worker-env.js";

/** `src/env.ts`, then `env.ts`; both present in one package is an error. */
export function findManifest(dir: string): string | null {
  const inSrc = join(dir, "src", "env.ts");
  const atRoot = join(dir, "env.ts");
  if (existsSync(inSrc) && existsSync(atRoot)) {
    throw new Error(
      `${dir} has BOTH src/env.ts and env.ts. One package gets one manifest.`,
    );
  }
  return existsSync(inSrc) ? inSrc : existsSync(atRoot) ? atRoot : null;
}

/** Needs a tsx-enabled process, which the `with-env` bin always is. */
export async function loadAppRegistry(dir: string): Promise<WorkerEnvRegistry> {
  const manifest = findManifest(dir);
  if (!manifest)
    throw new Error(`no env manifest (src/env.ts or env.ts) in ${dir}.`);

  // The Next apps' manifests run `createEnv` at import time; without the flag
  // they would validate the ambient environment and throw on whatever is
  // missing. Restored afterwards.
  const previous = process.env.SKIP_ENV_VALIDATION;
  process.env.SKIP_ENV_VALIDATION = "1";
  try {
    await import(pathToFileURL(manifest).href);
  } finally {
    if (previous === undefined) delete process.env.SKIP_ENV_VALIDATION;
    else process.env.SKIP_ENV_VALIDATION = previous;
  }

  const resolved = createRequire(manifest).resolve("@devdogsuga/env");
  return (await import(pathToFileURL(resolved).href)) as WorkerEnvRegistry;
}
