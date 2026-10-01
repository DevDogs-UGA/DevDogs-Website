#!/usr/bin/env node
/**
 * Entry point for the deprecated `devtools-ci-bare` bin: `backstage --no-env`,
 * with no tier resolution and no env-file loading. Same technique as
 * `bin/devtools-ci.mjs`, pointed at `launchCiBare`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { launchCiBare } = await import(join(dist, "launch-ci.js"));
try {
  await launchCiBare(process.argv.slice(2));
} catch (err) {
  process.stderr.write(
    `devtools-ci-bare: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  const { captureDevtoolsError } = await import(join(dist, "telemetry.js"));
  await captureDevtoolsError(err);
  process.exitCode = 1;
}
