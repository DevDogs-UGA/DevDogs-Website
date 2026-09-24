#!/usr/bin/env node
/**
 * Entry point for the `devtools-ci-bare` bin: `ci.ts`'s `main()` with no tier
 * resolution and no env-file loading — the counterpart to the old in-repo
 * `"ci": "tsx --conditions=devdogs-source src/ci.ts"` package script.
 *
 * `devtools-ci` (`bin/devtools-ci.mjs` -> `src/launch-ci.ts`) ALWAYS resolves
 * a deploy tier and calls `enterEnvironment` before dispatching to `ci.ts`.
 * That's wrong for two kinds of CI step: `deploy write-env`, which CREATES
 * the env file tier resolution would otherwise insist on reading first (a
 * bootstrap cycle), and the handful of steps that hold one narrow credential
 * via the job's own `env:` block and compose no env file at all (`preflight`,
 * `migrate`, `plan`, `require-planner`, `require-token`, `orphans`). Those
 * steps need `ci.ts`'s `main()` with nothing in front of it.
 *
 * Same technique as `bin/devtools.mjs` and `bin/devtools-ci.mjs` — see
 * `bin/devtools.mjs`'s header — except it imports `dist/ci.js` directly
 * rather than going through a `launch*.ts` wrapper: `ci.ts` has no
 * tier-resolution step to run first, so there is nothing for a wrapper
 * module to do. `dist/ci.js`'s own self-invoke guard
 * (`import.meta.url === file://${process.argv[1]}`) does not fire here —
 * `process.argv[1]` is this bin script, not `dist/ci.js` — so importing it
 * only defines `main`, exactly like `bin/devtools-ci.mjs`'s import of
 * `launch-ci.js` relies on.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ciEntry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "ci.js",
);

const { main } = await import(ciEntry);
try {
  await main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(
    `devtools-ci-bare: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  const { captureDevtoolsError } = await import(
    join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "telemetry.js")
  );
  await captureDevtoolsError(err);
  process.exitCode = 1;
}
