import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cachedOwnDir: string | undefined;

/** The published package's own root: the nearest directory above this
 * module's file that holds a `package.json`. A bundled CLI runs from a flat
 * `dist/`, so that is the CLI's root (`dist/launch.js` -> up one); the core
 * is inlined into it, so its own source location never matters at run time.
 * Memoized since it never changes within a process. */
export function ownPackageDir(): string {
  if (cachedOwnDir !== undefined) return cachedOwnDir;
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json")) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  cachedOwnDir = dir;
  return dir;
}

/** For source runs (tests), where the core is NOT inlined into a CLI's
 * bundle and so the nearest `package.json` is the core's own: names the CLI
 * package whose `env.ts` and `package.json` the run stands in for. A bundled
 * CLI never calls this. */
export function overrideOwnPackageDir(dir: string | undefined): void {
  cachedOwnDir = dir;
}

/** Reads this build's own `package.json` version — used by `telemetry.ts`
 * (release tagging) and the CLI's `version` command. */
export function ownVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(ownPackageDir(), "package.json"), "utf8"),
  ) as {
    version?: unknown;
  };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}
