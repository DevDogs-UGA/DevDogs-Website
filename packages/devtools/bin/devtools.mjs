#!/usr/bin/env node
/**
 * Entry point for the `devtools` bin.
 *
 * Ships built JS (see the package's `build` script — tsdown bundles `src/` and
 * the private `@devdogsuga/cli-core` into a flat `dist/`) and runs it
 * directly with plain `node`: no `tsx` wrapper, no
 * `--conditions=devdogs-source` flag. Those were needed when devtools lived
 * INSIDE the DevDogsUGA workspace and imported sibling `@devdogsuga/*`
 * packages by TypeScript source; published as its own package and run via
 * `pnpm dlx`, none of that applies — every `@devdogsuga/*` import now goes
 * through `src/repo/peers.ts`/`src/repo/source.ts`'s runtime resolution
 * against the TARGET repo instead, and `tsx` is a regular dependency used
 * only programmatically (`src/repo/tsx-loader.ts`) to load that repo's own
 * TypeScript (env manifests, cron contracts, `devdogs-source` packages).
 */
// Relative specifiers, not joined paths: `import()` takes URLs, and a Windows
// absolute path (`C:\...`) reads as the URL scheme `c:`.
const { launch } = await import("../dist/launch.js");
try {
  await launch(process.argv.slice(2));
} catch (err) {
  // Whatever escapes before a command is dispatched (repo discovery, tier
  // resolution, env entry) — the dispatch itself reports its own.
  process.stderr.write(
    `devtools: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  const { captureDevtoolsError } = await import("../dist/telemetry.js");
  await captureDevtoolsError(err);
  process.exitCode = 1;
}
