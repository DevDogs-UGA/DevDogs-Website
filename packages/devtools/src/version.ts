import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cachedOwnDir: string | undefined;

/** The directory this module's compiled file lives in one level under —
 * i.e. the devtools package's own root (`dist/version.js` → up one).
 * Exported for tests; memoized since it never changes within a process. */
export function ownPackageDir(): string {
  if (cachedOwnDir === undefined) {
    cachedOwnDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  }
  return cachedOwnDir;
}

/** Reads this build's own `package.json` version — used by `telemetry.ts`
 * (release tagging) and `cli.ts`'s `version` command. */
export function ownVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(ownPackageDir(), "package.json"), "utf8"),
  ) as {
    version?: unknown;
  };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}
