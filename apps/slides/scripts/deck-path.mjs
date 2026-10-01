// Which deck a script works on: the one named, else the newest in decks/.
// Decks are named `YYYY-MM-DD-<topic>.md`, so the newest sorts last. Plain
// Node, shared by slidev.mjs and follow.mjs.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `decks/<name>.md` for a bare name, a `decks/...` path, or the newest deck. */
export function resolveDeck(arg) {
  if (arg) {
    if (arg.includes("/")) return arg;
    return `decks/${arg.endsWith(".md") ? arg : `${arg}.md`}`;
  }
  const decks = readdirSync(join(appDir, "decks"))
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (!decks.length) throw new Error("No deck found in apps/slides/decks/");
  return `decks/${decks[decks.length - 1]}`;
}
