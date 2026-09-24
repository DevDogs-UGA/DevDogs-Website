#!/usr/bin/env node
/**
 * Entry point for the `devtools-ci` bin. Same technique as `bin/devtools.mjs`
 * — see that file's header — pointed at `dist/launch-ci.js` instead.
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
await launchCi(process.argv.slice(2));
