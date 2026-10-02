/**
 * The checks `doctor` runs against the checkout's committed data and the
 * session's database, beyond the machine and `.env` facts in `commands.ts`:
 *
 *   * the committed database types are not older than the newest migration
 *   * every storage bucket `config.toml` declares exists
 *   * meetings and workshops have been reconciled from config
 *   * somebody holds President
 *
 * Each is a small pure classifier over plain facts, so the tests need no
 * Postgres, git or filesystem; the readers below gather the facts and the
 * orchestrator in `commands.ts` wires them together. A database that cannot be
 * reached is a `skip`, never a warning: the stack being off is not a fault in
 * the checkout, and `doctor`'s other lines already say so.
 *
 * These replace what `db status` and the tail of `db reset` used to tell
 * a contributor: that the stack is up, that the seeds and buckets landed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { DoctorCheck } from "./commands.js";

const MIGRATIONS_DIR = "supabase/migrations";
const TYPES_FILE = "packages/supabase/src/database.types.ts";

// ── Pure classifiers ─────────────────────────────────────────────────────────

/** The database types were last changed before the newest migration was, so a
 * migration landed that they were never regenerated for. */
export function checkTypesFresh(
  typesChangedAt: number | null,
  migrationChangedAt: number | null,
  newestMigration: string | null,
): DoctorCheck {
  if (typesChangedAt === null || migrationChangedAt === null) {
    return {
      id: "types-stale",
      status: "skip",
      summary: "Could not tell whether the database types are current",
    };
  }
  const stale = typesChangedAt < migrationChangedAt;
  return {
    id: "types-stale",
    status: stale ? "warn" : "ok",
    summary: stale
      ? `The database types are older than the newest migration (${newestMigration})`
      : "The database types are at least as new as the newest migration",
    fix: stale
      ? "Regenerate them with `pnpm -F @devdogsuga/supabase types:db`."
      : undefined,
  };
}

export function checkBuckets(
  expected: readonly string[],
  actual: readonly string[],
): DoctorCheck {
  const missing = expected.filter((bucket) => !actual.includes(bucket));
  return {
    id: "buckets-missing",
    status: missing.length === 0 ? "ok" : "warn",
    summary:
      missing.length === 0
        ? `All ${expected.length} storage bucket${expected.length === 1 ? "" : "s"} exist`
        : `Missing storage bucket${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    fix:
      missing.length === 0
        ? undefined
        : "Create them with `pnpm devtools supabase seed buckets`.",
  };
}

export function checkEventsSeeded(
  meetings: number,
  workshops: number,
): DoctorCheck {
  const empty = [
    ...(meetings === 0 ? ["meetings"] : []),
    ...(workshops === 0 ? ["workshops"] : []),
  ];
  return {
    id: "events-empty",
    status: empty.length === 0 ? "ok" : "warn",
    summary:
      empty.length === 0
        ? `${meetings} meetings and ${workshops} workshops are in the database`
        : `No ${empty.join(" or ")} in the database yet`,
    fix:
      empty.length === 0
        ? undefined
        : "With the platform dev server running: `pnpm devtools jobs run --app platform --cron '*/15 * * * *'`.",
  };
}

export function checkPresident(holders: number): DoctorCheck {
  return {
    id: "president-missing",
    status: holders > 0 ? "ok" : "warn",
    summary:
      holders > 0
        ? "Somebody holds President"
        : "Nobody holds President, so the console is invisible to everyone",
    fix:
      holders > 0
        ? undefined
        : "Sign in once through the app, then `pnpm devtools roles grant <your email> President`.",
  };
}

// ── Readers ──────────────────────────────────────────────────────────────────

/** The bucket names `config.toml` declares as `[storage.buckets.<name>]`. */
export function declaredBuckets(configToml: string): string[] {
  return [...configToml.matchAll(/^\[storage\.buckets\.([A-Za-z0-9_-]+)\]/gm)]
    .map((match) => match[1]!)
    .filter((name, i, all) => all.indexOf(name) === i);
}

export function readDeclaredBuckets(repoRoot: string): string[] {
  const file = join(repoRoot, "supabase", "config.toml");
  return existsSync(file) ? declaredBuckets(readFileSync(file, "utf8")) : [];
}

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * When a file last changed, in ms: its commit time if it is committed and
 * clean, its mtime otherwise (a migration just written, types just
 * regenerated). Commit time rather than mtime for a clean file because a fresh
 * clone gives every file the same mtime and that would say nothing.
 */
export function lastChanged(repoRoot: string, relative: string): number | null {
  const absolute = join(repoRoot, relative);
  if (!existsSync(absolute)) return null;
  const dirty = git(repoRoot, ["status", "--porcelain", "--", relative]);
  if (dirty === "") {
    const committed = git(repoRoot, [
      "log",
      "-1",
      "--format=%ct",
      "--",
      relative,
    ]);
    if (committed) return Number(committed) * 1000;
  }
  return statSync(absolute).mtimeMs;
}

/** The newest migration's filename (they sort by their timestamp prefix). */
export function newestMigration(repoRoot: string): string | null {
  const dir = join(repoRoot, MIGRATIONS_DIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  return files.at(-1) ?? null;
}

export function typesFreshness(repoRoot: string): DoctorCheck {
  const newest = newestMigration(repoRoot);
  return checkTypesFresh(
    lastChanged(repoRoot, TYPES_FILE),
    newest ? lastChanged(repoRoot, `${MIGRATIONS_DIR}/${newest}`) : null,
    newest,
  );
}

export interface DatabaseFacts {
  buckets: string[];
  meetings: number;
  workshops: number;
  presidents: number;
}

/** The President role's fixed id (see the `core_roles` migration). */
const PRESIDENT_ROLE_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Reads the four facts in one short-lived connection. Constant SQL only.
 * Throws when the database cannot be reached or a table is missing, which the
 * caller turns into a skip.
 */
export async function probeDatabase(dbUrl: string): Promise<DatabaseFacts> {
  const sql = postgres(dbUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });
  try {
    const buckets = await sql.unsafe(`select id from storage.buckets`);
    const [counts] = await sql.unsafe(
      `select
         (select count(*) from platform."meetings")::int as meetings,
         (select count(*) from platform."workshops")::int as workshops,
         (select count(*) from platform."userRoles"
            where "roleId" = '${PRESIDENT_ROLE_ID}')::int as presidents`,
    );
    return {
      buckets: buckets.map((row) => String(row.id)),
      meetings: Number(counts?.meetings ?? 0),
      workshops: Number(counts?.workshops ?? 0),
      presidents: Number(counts?.presidents ?? 0),
    };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export function databaseChecks(
  facts: DatabaseFacts,
  expectedBuckets: readonly string[],
): DoctorCheck[] {
  return [
    checkBuckets(expectedBuckets, facts.buckets),
    checkEventsSeeded(facts.meetings, facts.workshops),
    checkPresident(facts.presidents),
  ];
}
