/**
 * `db sync`: make the contributor's development database match
 * `supabase/schemas/`.
 *
 * The schema files are the source; migrations are not committed in a product
 * (Q9), but the Supabase CLI's declarative flow still works in terms of them,
 * so a local, git-ignored `supabase/migrations/` is the record of what this
 * database has had applied:
 *
 *   1. `supabase db schema declarative sync --no-apply` diffs the schema tree
 *      against that record and writes the difference as a new migration, or
 *      nothing when they already agree. It needs Docker (a shadow database)
 *      but never touches the target.
 *   2. The new migration is applied: `supabase migration up --local` for the
 *      Docker stack, `supabase db push --db-url …` for a hosted project.
 *
 * A hosted project's applied migrations are also in its own history table, so a
 * machine with no local record (a second laptop, a deleted `supabase/migrations/`)
 * restores the record from there first (`supabase migration fetch --db-url`).
 * Without that, the diff would start from an empty database and write the whole
 * schema as one migration, which `db push` rejects as already applied.
 *
 * It never resets the database. A reset wipes `auth.custom_oauth_providers`,
 * which is where "Sign in with DevDogs" is registered (Q83); `--rebuild` is
 * the explicit escape hatch for a database that has drifted from its record,
 * and it registers the provider again afterwards.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Product } from "./config.js";
import type { SqlSession } from "./dev-data.js";
import type { Runner } from "./exec.js";
import { cliLine, type SupabaseCli } from "./supabase-cli.js";
import type { DbTarget } from "./target.js";

export class SyncError extends Error {
  constructor(
    message: string,
    readonly output?: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

export interface SyncOptions {
  /** Answer yes to the destructive-change question. */
  yes: boolean;
  /** Asked before applying a migration that drops data. Defaults to refusing. */
  confirmDestructive?: (sql: string, statements: string[]) => Promise<boolean>;
  /** Print what would run and change nothing. */
  dryRun?: boolean;
  log?: (line: string) => void;
  /**
   * Opens a connection to the target, so sync can check what the database
   * really has (its migration ledger and the product's schemas) instead of
   * trusting the local `supabase/migrations/` record alone. Omitted: no check.
   */
  open?: (dbUrl: string) => SqlSession;
}

export interface SyncResult {
  /** The migration file written, or null when the database already matched. */
  migration: string | null;
  applied: boolean;
  /** The statements that drop something, from the new migration. */
  destructive: string[];
}

/** `DROP TABLE|COLUMN|SCHEMA|TYPE|VIEW`, which loses data or breaks readers; constraints, indexes and policies do not. */
const DESTRUCTIVE =
  /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|FUNCTION)\b/i;

export function destructiveStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => DESTRUCTIVE.test(statement.replace(/--.*$/gm, "")));
}

function migrationFiles(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort()
    : [];
}

export async function dbSync(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  options: SyncOptions,
): Promise<SyncResult> {
  const log = options.log ?? (() => undefined);
  const { migrationsDir, schemasDir } = product.paths;
  if (!existsSync(schemasDir)) {
    throw new SyncError(
      `${product.config.supabase.dir}/schemas does not exist; there is nothing to sync.`,
    );
  }
  mkdirSync(migrationsDir, { recursive: true });

  const generateArgs = [
    ...cli.prefix,
    "db",
    "schema",
    "declarative",
    "sync",
    "--no-apply",
    "--name",
    "devtools_sync",
  ];
  const fetchArgs = [
    ...cli.prefix,
    "migration",
    "fetch",
    "--db-url",
    target.dbUrl,
  ];
  const needsRecord =
    target.kind === "hosted" && migrationFiles(migrationsDir).length === 0;
  if (options.dryRun) {
    if (needsRecord) {
      log(
        `Would run: ${cliLine(cli, ["migration", "fetch", "--db-url", "<DB_URL>"])} (this machine has no record of what the project has had applied)`,
      );
    }
    log(`Would run: ${cliLine(cli, generateArgs.slice(cli.prefix.length))}`);
    log(
      target.kind === "local"
        ? `Would run: ${cliLine(cli, ["migration", "up", "--local"])}`
        : `Would run: ${cliLine(cli, ["db", "push", "--db-url", "<DB_URL>", "--yes"])}`,
    );
    return { migration: null, applied: false, destructive: [] };
  }

  if (needsRecord) {
    // A brand-new project has no history table yet, and fetch fails: nothing
    // to restore, so the full schema is the right first migration.
    const fetched = await run(cli.command, fetchArgs, { cwd: product.root });
    const restored = migrationFiles(migrationsDir).length;
    if (fetched.code === 0 && restored > 0) {
      log(
        `Restored ${restored} applied migration${restored === 1 ? "" : "s"} from the project's history.`,
      );
    }
  }

  await reconcileRecord(product, cli, target, run, options, log);

  const before = new Set(migrationFiles(migrationsDir));
  let generated = await run(cli.command, generateArgs, { cwd: product.root });
  // The shadow database runs in a container the CLI pulls and starts on first
  // use; right after the stack boots on a fresh machine that start can fail
  // once ("error running container: exit 1") and work the next time.
  if (generated.code !== 0 && isContainerFailure(generated)) {
    log("The shadow database did not start; trying once more.");
    generated = await run(cli.command, generateArgs, { cwd: product.root });
  }
  if (generated.code !== 0) {
    throw new SyncError(
      isContainerFailure(generated)
        ? "Could not diff the schema: Docker is needed for the shadow database. Start Docker and try again."
        : "Could not diff the schema against what this database has had applied.",
      generated.stderr || generated.stdout,
    );
  }
  const created = migrationFiles(migrationsDir).filter((f) => !before.has(f));
  if (created.length === 0) {
    log("The database already matches supabase/schemas.");
    return { migration: null, applied: false, destructive: [] };
  }
  const migration = created[created.length - 1]!;
  const sql = readFileSync(join(migrationsDir, migration), "utf8");
  const destructive = destructiveStatements(sql);

  if (destructive.length > 0 && !options.yes) {
    const approved = options.confirmDestructive
      ? await options.confirmDestructive(sql, destructive)
      : false;
    if (!approved) {
      // Leave no half-state: the unapplied file would be diffed against next time.
      for (const file of created) rmSync(join(migrationsDir, file));
      throw new SyncError(
        `The change drops data in your development database (${destructive.length} statement${destructive.length === 1 ? "" : "s"}). Re-run with --yes to allow it.`,
        destructive.join(";\n"),
      );
    }
  }

  log(`Applying ${migration}`);
  const applyArgs =
    target.kind === "local"
      ? [...cli.prefix, "migration", "up", "--local"]
      : [...cli.prefix, "db", "push", "--db-url", target.dbUrl, "--yes"];
  const applied = await run(cli.command, applyArgs, { cwd: product.root });
  if (applied.code !== 0) {
    // The record now lists a migration the database does not have. Remove it
    // so the next sync diffs from what is true.
    for (const file of created) rmSync(join(migrationsDir, file));
    throw new SyncError(
      "The change did not apply. Your schema files may not be valid SQL, or the database has drifted from what devtools recorded (`devtools db sync --rebuild` starts over).",
      applied.stderr || applied.stdout,
    );
  }
  return { migration, applied: true, destructive };
}

/** `20261011120000` from `20261011120000_devtools_sync.sql`. */
function versionOf(file: string): string {
  return file.split("_")[0] ?? file;
}

/**
 * Makes the local record agree with the database. The declarative diff only
 * compares `supabase/schemas` with `supabase/migrations`, so a database that
 * lost its contents behind the record's back (a hosted project reset from the
 * dashboard, a checkout switched from the local stack to a hosted project)
 * would read as "already matches". This asks the target:
 *
 *   - a migration in the record that is not in the database's ledger was never
 *     applied there: it is dropped from the record, so the diff re-creates it;
 *   - a configured schema that does not exist means the ledger is stale too:
 *     its entries are reverted and the whole record dropped, so the diff
 *     writes the full schema again.
 *
 * Nothing is reset or dropped in the database; only ledger rows of schemas
 * that are already gone are removed. A database that cannot be reached is
 * left to the apply step to report.
 */
async function reconcileRecord(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  options: SyncOptions,
  log: (line: string) => void,
): Promise<void> {
  if (!options.open) return;
  const { migrationsDir } = product.paths;
  const files = migrationFiles(migrationsDir);
  let ledger: string[] | null;
  let missing: string[];
  let session: SqlSession | undefined;
  try {
    session = options.open(target.dbUrl);
    ledger = await session.appliedMigrations();
    missing = await session.missingSchemas(product.config.supabase.schemas);
  } catch (err) {
    log(
      `Could not check what the database has applied (${(err as Error).message}); trusting the local record.`,
    );
    return;
  } finally {
    await session?.close().catch(() => undefined);
  }

  if (missing.length > 0) {
    const stale = ledger ?? [];
    log(
      `The database is missing ${missing.length === 1 ? "schema" : "schemas"} ${missing.join(", ")}, so the record of applied migrations is out of date; rebuilding it from supabase/schemas.`,
    );
    if (stale.length > 0) {
      const reverted = await run(
        cli.command,
        [
          ...cli.prefix,
          "migration",
          "repair",
          "--status",
          "reverted",
          "--db-url",
          target.dbUrl,
          ...stale,
        ],
        { cwd: product.root },
      );
      if (reverted.code !== 0) {
        throw new SyncError(
          "The database lost its schema but its migration history still lists migrations as applied, and clearing that history failed.",
          reverted.stderr || reverted.stdout,
        );
      }
    }
    for (const file of files) rmSync(join(migrationsDir, file));
    return;
  }

  const applied = new Set(ledger ?? []);
  const unapplied = files.filter((file) => !applied.has(versionOf(file)));
  if (unapplied.length > 0) {
    log(
      `${unapplied.length} migration${unapplied.length === 1 ? "" : "s"} in the local record ${unapplied.length === 1 ? "is" : "are"} not in this database's history (it was reset, or this checkout switched databases); re-applying ${unapplied.length === 1 ? "it" : "them"}.`,
    );
    for (const file of unapplied) rmSync(join(migrationsDir, file));
  }
}

function isContainerFailure(result: {
  stderr: string;
  stdout: string;
}): boolean {
  return /docker|container|image/i.test(result.stderr + result.stdout);
}

/** Forgets what was applied: removes the git-ignored local migrations. */
export function forgetMigrations(product: Product): string[] {
  const files = migrationFiles(product.paths.migrationsDir);
  for (const file of files) rmSync(join(product.paths.migrationsDir, file));
  return files;
}
