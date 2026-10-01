#!/usr/bin/env node
/**
 * Entry point for the deprecated `devtools-ci` bin, which forwards to
 * `@devdogsuga/backstage`'s code (see `src/launch-ci.ts`). Same technique as
 * `bin/devtools.mjs` — see that file's header — pointed at `dist/launch-ci.js`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const launchCiEntry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "launch-ci.js",
);

const { launchCi } = await import(launchCiEntry);
try {
  await launchCi(process.argv.slice(2));
} catch (err) {
  // Whatever escapes before a command is dispatched (repo discovery, tier
  // resolution, env entry) — the dispatch itself reports its own. See
  // `bin/devtools-ci-bare.mjs` for the same shape.
  process.stderr.write(
    `devtools-ci: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  const { captureDevtoolsError } = await import(
    join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "telemetry.js")
  );
  await captureDevtoolsError(err);
  process.exitCode = 1;
}
