/**
 * Keeps a closed stdout/stderr from crashing devtools.
 *
 * When whatever reads devtools' output goes away first (`devtools … | head`,
 * or a wrapper that stopped listening), the next write fails with EPIPE. The
 * stream emits that as an `'error'` event nobody handles, so Node throws it as
 * an uncaught exception and Sentry files it as a fatal. Nobody is left to read
 * the output, so dropping it is the right outcome. Any other stream error is
 * rethrown and crashes as it did before.
 *
 * Idempotent, because `launch`, `launchCi` and `ci.ts`'s `main` can all run in
 * one process.
 */
let installed = false;

export function ignoreClosedPipes(): void {
  if (installed) return;
  installed = true;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") throw err;
    });
  }
}
