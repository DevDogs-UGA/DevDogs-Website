/**
 * The database the local scripts (`populate:courses`, `populate:buildings`)
 * write to, found the way the rest of the repo finds it.
 *
 * `DB_URL` in the process environment wins. Otherwise the repository root's
 * `.env.generated` (written by `devtools setup` while the local Supabase stack
 * is up, and the stack's own connection string) and then `.env` are read, in
 * that order, as `with-env` reads them. The scripts do not go through
 * `with-env` itself: that routes by the app's env manifest, and the deployed
 * catalog Worker must not declare `DB_URL`, because a declared secret is
 * uploaded to the Worker and the catalog reaches its database through
 * Hyperdrive only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const ROOT = resolve(import.meta.dirname, "../../..");

/** Where `DB_URL` is looked up after the environment, first match wins. */
export const ENV_FILES = [".env.generated", ".env"] as const;

export function localDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  root = ROOT,
): string | undefined {
  if (env.DB_URL) return env.DB_URL;
  for (const name of ENV_FILES) {
    const file = resolve(root, name);
    if (!existsSync(file)) continue;
    const value = parseEnv(readFileSync(file, "utf8")).DB_URL;
    if (value) return value;
  }
  return undefined;
}

/** The URL, or a message and exit code 2 when there is none. */
export function requireLocalDatabaseUrl(): string {
  const url = localDatabaseUrl();
  if (!url) {
    console.error(
      "DB_URL is not set, and neither .env.generated nor .env at the repository root has one. " +
        "Start the local stack and run `devtools setup`, or set DB_URL.",
    );
    process.exit(2);
  }
  return url;
}
