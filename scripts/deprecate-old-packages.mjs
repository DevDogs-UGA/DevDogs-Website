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

/** Where each old package lives in the sdk: the subpaths its exports map has. */
export const SDK_SUBPATHS = {
  brand: ["brand"],
  env: ["env"],
  // The old db package is three subpaths in the sdk; there is no "sdk/db".
  db: ["db/client", "db/server", "db/typegen"],
  headers: ["headers"],
  telemetry: ["telemetry"],
};

export function deprecationFor(name) {
  const paths = SDK_SUBPATHS[name].map((path) => `"@devdogsuga/sdk/${path}"`);
  const where =
    paths.length === 1
      ? `import it from ${paths[0]}`
      : `import it from ${paths.slice(0, -1).join(", ")} or ${paths.at(-1)}`;
  return {
    spec: `@devdogsuga/${name}@*`,
    message: `Merged into @devdogsuga/sdk; ${where} (the subpaths are listed in its README).`,
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
