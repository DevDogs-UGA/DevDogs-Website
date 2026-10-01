#!/usr/bin/env node
/**
 * Entry point for the `backstage` bin.
 *
 * Ships built JS (tsdown bundles `src/` and the private
 * `@devdogsuga/cli-core` into a flat `dist/`) and runs it with plain `node`.
 * It starts anywhere, a DevDogsUGA checkout or not: the DevDogsUGA packages it
 * reads (`@devdogsuga/env`, `@devdogsuga/db`) are optional peers, resolved
 * through the checkout only by the commands that need one.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { launch } = await import(join(dist, "launch.js"));
try {
  await launch(process.argv.slice(2));
} catch (err) {
  // Whatever escapes before a command is dispatched (repo discovery, env
  // entry); the dispatch reports its own.
  process.stderr.write(
    `backstage: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  const { captureDevtoolsError } = await import(join(dist, "telemetry.js"));
  await captureDevtoolsError(err);
  process.exitCode = 1;
}
