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
 * The record only says what *should* be in the database. Before the diff,
 * sync therefore compares the database itself with the record (`supabase db
 * diff --from <database> --to migrations`, restricted to the product's
 * schemas) and re-applies whatever is missing: a dropped table, a dropped
 * schema, a database reset behind the record's back. The migration ledger is
 * never trusted to decide anything; it is rewritten to list the record when it
 * is missing or short. "The database already matches" is therefore a
 * statement about the live database.
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
   * Opens a connection to the target, so sync can compare what the database
   * really has with the local `supabase/migrations/` record instead of
   * trusting the record alone. Omitted: no check.
   */
  open?: (dbUrl: string) => SqlSession;
}

export interface SyncResult {
  /** The migration file written, or null when none was needed. */
  migration: string | null;
  /** The database changed: a migration was applied, or missing objects were restored. */
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
    if (options.open) {
      log(
        `Would run: ${cliLine(cli, liveDiffArgs(product, target).slice(cli.prefix.length))} (and restore anything the database lost)`,
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

  const restored = await restoreDatabase(
    product,
    cli,
    target,
    run,
    options,
    log,
  );

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
    if (!restored.applied) {
      log("The database already matches supabase/schemas.");
    }
    return {
      migration: null,
      applied: restored.applied,
      destructive: restored.destructive,
    };
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
  return {
    migration,
    applied: true,
    destructive: [...restored.destructive, ...destructive],
  };
}

/** `20261011120000` from `20261011120000_devtools_sync.sql`. */
function versionOf(file: string): string {
  return file.split("_")[0] ?? file;
}

function liveDiffArgs(product: Product, target: DbTarget): string[] {
  return [
    "db",
    "diff",
    "--from",
    target.kind === "local" ? "local" : target.dbUrl,
    "--to",
    "migrations",
    "--use-pg-delta",
    "--schema",
    product.config.supabase.schemas.join(","),
    "--output-format",
    "json",
  ];
}

/**
 * The SQL that turns the database into what the record describes, from the
 * CLI's pg-delta diff (database to migrations baseline). Empty when they
 * agree. Only the product's own schemas are compared, so the platform's
 * (auth, storage, ...) never show up as drift.
 */
async function liveDiff(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  log: (line: string) => void,
): Promise<string> {
  const args = [...cli.prefix, ...liveDiffArgs(product, target)];
  let result = await run(cli.command, args, { cwd: product.root });
  if (result.code !== 0 && isContainerFailure(result)) {
    log("The shadow database did not start; trying once more.");
    result = await run(cli.command, args, { cwd: product.root });
  }
  if (result.code !== 0) {
    throw new SyncError(
      isContainerFailure(result)
        ? "Could not compare the database with its record: Docker is needed for the shadow database. Start Docker and try again."
        : "Could not compare the database with what devtools recorded as applied.",
      result.stderr || result.stdout,
    );
  }
  // The CLI prints progress too; the answer is the JSON object with `diff`.
  for (const line of result.stdout.split("\n").reverse()) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(text) as { diff?: unknown };
      if (typeof parsed.diff === "string") return parsed.diff;
    } catch {
      // Not the answer; keep looking.
    }
  }
  throw new SyncError(
    "Could not read the result of comparing the database with its record.",
    result.stdout || result.stderr,
  );
}

/**
 * Makes the database agree with the local record, from the database itself.
 * The declarative diff only compares `supabase/schemas` with
 * `supabase/migrations`, so a database that lost objects behind the record's
 * back (a table dropped by hand, a hosted project reset from the dashboard, a
 * checkout switched from the local stack to a hosted project) would read as
 * "already matches". So, with a record to compare against:
 *
 *   1. the database is diffed against the record, per configured schema, and
 *      whatever it lacks is created again (data in what remains is untouched);
 *      statements that drop something need the same approval as any change;
 *   2. the migration ledger is made to list every migration in the record
 *      (marking them applied, which they now are), so the next
 *      `migration up` applies only what is new.
 *
 * A missing or unreadable ledger decides nothing by itself: it is rewritten,
 * never read as "start over". A database that cannot be reached is left to
 * the apply step to report.
 */
async function restoreDatabase(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  options: SyncOptions,
  log: (line: string) => void,
): Promise<{ applied: boolean; destructive: string[] }> {
  const nothing = { applied: false, destructive: [] as string[] };
  const files = migrationFiles(product.paths.migrationsDir);
  if (!options.open || files.length === 0) return nothing;

  let session: SqlSession | undefined;
  let missing: string[];
  let ledger: string[] | null | undefined;
  try {
    session = options.open(target.dbUrl);
    // Doubles as the reachability check.
    missing = await session.missingSchemas(product.config.supabase.schemas);
  } catch (err) {
    log(
      `Could not check what the database has (${(err as Error).message}); trusting the local record.`,
    );
    await session?.close().catch(() => undefined);
    return nothing;
  }
  try {
    try {
      ledger = await session.appliedMigrations();
    } catch (err) {
      ledger = undefined;
      log(
        `Could not read the migration history (${(err as Error).message}); deciding from the schemas alone.`,
      );
    }

    const sql = (await liveDiff(product, cli, target, run, log)).trim();
    let applied = false;
    let destructive: string[] = [];
    if (sql) {
      destructive = destructiveStatements(sql);
      if (destructive.length > 0 && !options.yes) {
        const approved = options.confirmDestructive
          ? await options.confirmDestructive(sql, destructive)
          : false;
        if (!approved) {
          throw new SyncError(
            `The database differs from supabase/schemas and putting it right drops data in your development database (${destructive.length} statement${destructive.length === 1 ? "" : "s"}). Re-run with --yes to allow it.`,
            destructive.join(";\n"),
          );
        }
      }
      log(
        missing.length > 0
          ? `The database is missing ${missing.length === 1 ? "schema" : "schemas"} ${missing.join(", ")}; creating ${missing.length === 1 ? "it" : "them"} again from supabase/schemas.`
          : "The database has lost part of supabase/schemas (a dropped table, view or function, perhaps); restoring it. Existing data is kept.",
      );
      try {
        await session.exec(sql);
      } catch (err) {
        throw new SyncError(
          "Could not restore what the database lost. `devtools db sync --rebuild` starts over (it wipes local data).",
          (err as Error).message,
        );
      }
      applied = true;
    }

    // The database now holds everything the record describes; say so in the
    // ledger, or `migration up` would run the whole record again.
    if (ledger !== undefined) {
      const known = new Set(ledger ?? []);
      const unlisted = files
        .map(versionOf)
        .filter((version) => !known.has(version));
      if (unlisted.length > 0) {
        if (ledger === null) {
          log(
            "The database has no migration history table; recreating it from the local record.",
          );
        }
        const repaired = await run(
          cli.command,
          [
            ...cli.prefix,
            "migration",
            "repair",
            "--status",
            "applied",
            "--db-url",
            target.dbUrl,
            ...unlisted,
          ],
          { cwd: product.root },
        );
        if (repaired.code !== 0) {
          throw new SyncError(
            "Could not record the applied migrations in the database's history.",
            repaired.stderr || repaired.stdout,
          );
        }
      }
    }
    return { applied, destructive };
  } finally {
    await session.close().catch(() => undefined);
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
