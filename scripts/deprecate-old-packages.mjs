#!/usr/bin/env node
/**
 * Q25: the five packages merged into @devdogsuga/sdk are deprecated on npm
 * with a pointer to the sdk. Run it once, by hand, signed in to npm as a
 * maintainer of the @devdogsuga scope (`npm login`), after the first sdk
 * prerelease is out:
 *
 *   node scripts/deprecate-old-packages.mjs          # print what it would do
 *   node scripts/deprecate-old-packages.mjs --apply  # do it
 *
 * Deprecating is idempotent and reversible (`npm deprecate <pkg> ""`).
 */
import { spawnSync } from "node:child_process";

export const OLD_PACKAGES = ["brand", "env", "db", "headers", "telemetry"];

export function deprecationFor(name) {
  return {
    spec: `@devdogsuga/${name}@*`,
    message: `Merged into @devdogsuga/sdk; import it from "@devdogsuga/sdk/${name}" (the subpaths are listed in its README).`,
  };
}

function main() {
  const apply = process.argv.includes("--apply");
  let failed = false;
  for (const name of OLD_PACKAGES) {
    const { spec, message } = deprecationFor(name);
    console.log(`npm deprecate ${spec} "${message}"`);
    if (!apply) continue;
    const result = spawnSync("npm", ["deprecate", spec, message], {
      stdio: "inherit",
    });
    if (result.status !== 0) failed = true;
  }
  if (!apply) console.log("\nDry run. Pass --apply to deprecate them.");
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
