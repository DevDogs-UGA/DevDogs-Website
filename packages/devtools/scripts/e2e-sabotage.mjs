#!/usr/bin/env node
// Breaks the BUILT devtools on purpose, so the end-to-end setup check
// (.github/workflows/devtools-e2e.yaml) can be seen to turn red. Only that
// workflow's manual run calls it, on the runner's own copy of the build; the
// source and `main` are never touched.
//
//   node scripts/e2e-sabotage.mjs <mode>
//
// Each mode rewrites one string in dist/. A mode whose string is not found
// fails loudly, so this cannot go stale and quietly stop breaking anything.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const MODES = {
  // `supabase start` is given a flag that does not exist, so `setup --local`
  // fails the way a broken Supabase invocation does for every member.
  "supabase-start": ['"--ignore-health-check"', '"--no-such-flag"'],
  // `doctor` no longer finds the product's config.
  "doctor-config": ["devtools.config.json", "devtools.config.missing"],
};

const mode = process.argv[2];
if (!mode || !(mode in MODES)) {
  console.error(`Usage: e2e-sabotage.mjs <${Object.keys(MODES).join("|")}>`);
  process.exit(2);
}
const [from, to] = MODES[mode];
const dist = fileURLToPath(new URL("../dist", import.meta.url));
let changed = 0;
for (const name of readdirSync(dist).filter((f) => f.endsWith(".js"))) {
  const file = join(dist, name);
  const text = readFileSync(file, "utf8");
  if (!text.includes(from)) continue;
  writeFileSync(file, text.split(from).join(to));
  changed += 1;
}
if (changed === 0) {
  console.error(
    `Mode ${mode}: ${from} is not in dist/ any more. Update this script.`,
  );
  process.exit(1);
}
console.log(`Sabotaged the build (${mode}): ${changed} file(s) changed.`);
