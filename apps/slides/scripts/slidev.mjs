#!/usr/bin/env node
// `pnpm dev [deck]` / `pnpm build [deck]`: run Slidev on one deck. The deck is
// a bare name (`2026-09-28-supabase`), a `decks/...` path, or omitted for the
// newest deck in decks/. Anything after the deck goes to Slidev as flags.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeck } from "./deck-path.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...rest] = process.argv.slice(2);
if (command !== "dev" && command !== "build") {
  console.error("usage: slidev.mjs <dev|build> [deck] [slidev flags]");
  process.exit(2);
}

const [first, ...flags] = rest;
const named = first && !first.startsWith("-");
const deck = resolveDeck(named ? first : undefined);
const args = [...(named ? [] : first ? [first] : []), ...flags];

const result = spawnSync(
  "pnpm",
  ["exec", "slidev", ...(command === "build" ? ["build"] : []), deck, ...args],
  { cwd: appDir, stdio: "inherit" },
);
process.exit(result.status ?? 1);
