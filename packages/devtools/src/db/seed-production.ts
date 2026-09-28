/**
 * `db seed production` — apply `supabase/seed/production/*.sql` to a target.
 *
 * The DevDogsUGA repo splits its seeds into `supabase/seed/production/`
 * (the role catalogue and the officer board — content every tier needs)
 * and `supabase/seed/development/` (password-login personas and a worked
 * moderation report — local-dev-only, never meant to reach a hosted
 * target). `db reset` used to run both, but only ever against a LOCAL
 * stack, back when `detectLocalInstance()` was the only way this CLI found
 * a database at all. The session system changed that: `db reset` now runs
 * against any tier, including staging and production, so a reset there
 * explicitly passes `--no-seed` to the Supabase CLI and calls this function
 * itself afterward (see `stack.ts`'s `reset()`) — the config-derived
 * `[db.seed]` list is no longer trusted to keep development's seeds off a
 * hosted target on its own. `production/` is also what a staging or
 * production target needs applied WITHOUT a reset — an already-migrated
 * database that only needs this content refreshed — which is this command's
 * other, still-current use: run it directly, instead of hand-picking files
 * with `db query --file`.
 *
 * That is a deliberate departure from `runSeedRoles` (`seed-roles.ts`),
 * which pipes its one file through `supabase db query --file --db-url`.
 * `03_officers.sql` is many separate `insert into` statements in one file,
 * and the supabase CLI's `db query` runs its `--file` argument as a single
 * PREPARED statement — confirmed against the local stack, where it fails
 * every multi-statement seed file with "cannot insert multiple commands
 * into a prepared statement". `01_roles.sql` only ever worked through that
 * path because it happens to be one big `with … insert … select`
 * statement. So this connects directly with `postgres` (`prepare: false`,
 * the same setting `planner/db.ts` uses and for the same reason: the
 * simple query protocol, not the extended one, is what allows more than
 * one statement per round trip) and runs each file's raw text, rather than
 * shelling out per file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { findRepoRoot } from "../repo/root.js";

const SEED_DIR = "production";

// Lazy, like seed-roles.ts's `seedFiles()` — computed inside
// `runSeedProduction`, not at module load, so importing this file never
// calls `findRepoRoot()` (or touches the filesystem) on its own.
function seedFiles(): string[] {
  const dir = join(findRepoRoot(), "supabase", "seed", SEED_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(dir, name));
}

/** Injectable so a test can fake the connection without a real Postgres. */
export interface SeedProductionDb {
  unsafe(query: string): Promise<unknown>;
  end(): Promise<void>;
}

/** Real connection: `prepare: false` so multi-statement files run over the
 * simple query protocol instead of gotrue's `db query --file` prepared-
 * statement path, which refuses them. `max: 1` — this is a short-lived,
 * sequential CLI invocation, never a pool. */
function connect(dbUrl: string): SeedProductionDb {
  const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 15 });
  return {
    unsafe: (query) => sql.unsafe(query),
    end: () => sql.end({ timeout: 5 }),
  };
}

export async function runSeedProduction(
  dbUrl: string,
  deps: { connect: (url: string) => SeedProductionDb } = { connect },
): Promise<number> {
  const db = deps.connect(dbUrl);
  try {
    for (const file of seedFiles()) {
      try {
        await db.unsafe(readFileSync(file, "utf8"));
      } catch (err) {
        process.stderr.write(
          `devtools db seed production: ${file} failed: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
        return 1;
      }
    }
    return 0;
  } finally {
    await db.end();
  }
}
