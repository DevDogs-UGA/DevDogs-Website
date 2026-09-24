#!/usr/bin/env node
/**
 * Entry point for the `newsletter` bin — see `src/cli.ts`'s header for why
 * this runs built JS directly rather than through `tsx`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

const { main } = await import(cliEntry);
await main(process.argv.slice(2));
