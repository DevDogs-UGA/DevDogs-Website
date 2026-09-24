#!/usr/bin/env node
/**
 * Entry point for the `devtools` bin.
 *
 * Ships built JS (see the package's `build` script — `tsc` to `dist/`) and
 * runs it directly with plain `node`: no `tsx` wrapper, no
 * `--conditions=devdogs-source` flag. Those were needed when devtools lived
 * INSIDE the DevDogsUGA workspace and imported sibling `@devdogsuga/*`
 * packages by TypeScript source; published as its own package and run via
 * `pnpm dlx`, none of that applies — every `@devdogsuga/*` import now goes
 * through `src/repo/peers.ts`/`src/repo/source.ts`'s runtime resolution
 * against the TARGET repo instead, and `tsx` is a regular dependency used
 * only programmatically (`src/repo/tsx-loader.ts`) to load that repo's own
 * TypeScript (env manifests, cron contracts, `devdogs-source` packages).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const launchEntry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "launch.js",
);

const { launch } = await import(launchEntry);
await launch(process.argv.slice(2));
