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
 * The record only says what *should* be in the database, so before the diff,
 * sync compares the live database with it (`supabase db diff --from <database>
 * --to migrations --use-pg-delta`, limited to the product's schemas) and sorts
 * every difference (`drift.ts`):
 *
 *   - missing (a dropped table, schema, column, index, policy, function; a
 *     missing migration ledger): recreated. Only CREATE and ADD statements are
 *     ever run, and the ledger is rewritten from the local record.
 *   - extra (a table, column, index or sequence a member added): listed as a
 *     warning and left alone. `--strict` fails on them instead.
 *   - conflicting (a column's type, a function body, ... defined differently
 *     in the database and the schema files): refused. Nothing is altered
 *     silently; the member edits the schema files or runs `--rebuild`.
 *
 * "Matches" is only ever said after that comparison ran. If it cannot run
 * (the database is unreachable, the password is wrong, the diff tool fails)
 * the sync fails and says so. A schema change the member pulled is a
 * different thing: it is the difference between the files and the record, and
 * keeps the declarative path below, including the `--yes` question for drops.
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
import type { Runner } from "./exec.js";
import { cliLine, type SupabaseCli } from "./supabase-cli.js";
import type { SqlSession } from "./dev-data.js";
import { classifyDiff, type Finding } from "./drift.js";
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
  /** `--strict`: extra objects in the database fail the sync instead of warning. */
  strict?: boolean;
  log?: (line: string) => void;
  /** Where warnings go; defaults to `log`. */
  warn?: (line: string) => void;
  /**
   * Opens a connection to the target, to compare the live database with the
   * local record. Omitted: no comparison, and sync never says "matches".
   */
  open?: (dbUrl: string) => SqlSession;
}

export interface SyncResult {
  /** The migration file written, or null when none was needed. */
  migration: string | null;
  /** The database changed: a migration was applied, or missing objects were restored. */
  applied: boolean;
  /** Missing objects that were created again. */
  restored: string[];
  /** Objects in the database that the schema files do not define (left alone). */
  extras: Finding[];
  /** The live database was compared with the record and nothing was missing or conflicting. */
  compared: boolean;
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

const NOTHING: Pick<SyncResult, "restored" | "extras" | "compared"> = {
  restored: [],
  extras: [],
  compared: false,
};

/** `20261011120000` from `20261011120000_devtools_sync.sql`. */
function versionOf(file: string): string {
  return file.split("_")[0] ?? file;
}

/** The connection string and its password never reach the terminal. */
function redactor(target: DbTarget): (text: string) => string {
  const secrets = new Set<string>([target.dbUrl]);
  try {
    const url = new URL(target.dbUrl);
    for (const value of [url.password, decodeURIComponent(url.password)]) {
      if (value) secrets.add(value);
    }
  } catch {
    // Not a URL (the dry-run placeholder); the whole string is redacted below.
  }
  return (text) => {
    let out = text;
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
      out = out
        .split(secret)
        .join(secret === target.dbUrl ? "<DB_URL>" : "<password>");
    }
    return out;
  };
}

export function liveDiffArgs(product: Product, target: DbTarget): string[] {
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

interface LiveDiffAnswer {
  diff?: unknown;
  error?: { message?: unknown };
}

/**
 * The SQL that would turn the live database into what the record describes
 * (pg-delta, database to migrations). Never applied as is. A diff that cannot
 * run is an error: there is no fallback to trusting the record.
 */
async function liveDiff(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  log: (line: string) => void,
  redact: (text: string) => string,
): Promise<string> {
  const args = [...cli.prefix, ...liveDiffArgs(product, target)];
  let result = await run(cli.command, args, { cwd: product.root });
  if (result.code !== 0 && isContainerFailure(result)) {
    log("The shadow database did not start; trying once more.");
    result = await run(cli.command, args, { cwd: product.root });
  }
  const raw = result.stdout + "\n" + result.stderr;
  // The CLI prints progress too; the answer is one JSON object, `{"diff": ...}`
  // or `{"_tag":"Error","error":{"message": ...}}`.
  let parsed = null as LiveDiffAnswer | null;
  for (const line of result.stdout.split("\n").reverse()) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      parsed = JSON.parse(text) as LiveDiffAnswer;
      break;
    } catch {
      // Not the answer; keep looking.
    }
  }
  if (result.code === 0 && parsed && typeof parsed.diff === "string") {
    return parsed.diff;
  }
  const reason =
    typeof parsed?.error?.message === "string"
      ? parsed.error.message
      : result.stderr.trim() || result.stdout.trim();
  throw new SyncError(
    isContainerFailure({ stdout: "", stderr: raw }) && !parsed?.error
      ? "Could not compare the database with supabase/schemas: Docker is needed for the shadow database. Start Docker and try again. Nothing was changed,, and the database was not checked against supabase/schemas."
      : "Could not compare the database with supabase/schemas, so nothing was changed, and the database was not checked against supabase/schemas. Fix the connection (is the database running, is the password right?) and run `devtools db sync` again.",
    redact(reason),
  );
}

/** Lists the headline objects; their constraints, policies and the like are a count. */
export function summarize(labels: readonly string[]): string {
  const major = labels.filter((label) =>
    /^(schema|table|function|view|sequence|type|column) /.test(label),
  );
  if (major.length === 0 || major.length === labels.length) {
    return labels.join(", ");
  }
  const rest = labels.length - major.length;
  return `${major.join(", ")} (and ${rest} related ${rest === 1 ? "thing" : "things"}: constraints, policies, indexes)`;
}

/** How to clean up a database that has things the schema files do not define. */
function cleanupHint(target: DbTarget): string {
  return target.kind === "local"
    ? "To clean up: `devtools db sync --rebuild` (it wipes your development database), then `devtools dev-data` to load the sample data again."
    : "To clean up: reset the project from its dashboard (Database > Settings), then run `devtools db sync` and `devtools dev-data`.";
}

function listFindings(findings: readonly Finding[]): string {
  return findings.map((f) => `- ${f.object}: ${f.detail}`).join("\n");
}

/**
 * Compares the live database with the record and puts right what is safe.
 * See the header comment for the three kinds of difference.
 */
async function reconcileLive(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  options: SyncOptions,
  log: (line: string) => void,
  warn: (line: string) => void,
  redact: (text: string) => string,
): Promise<Pick<SyncResult, "restored" | "extras" | "compared">> {
  const files = migrationFiles(product.paths.migrationsDir);
  // No record: the first migration creates everything, so there is nothing to
  // compare yet (and nothing to claim).
  if (!options.open || files.length === 0) return NOTHING;

  const { schemas } = product.config.supabase;
  let session: SqlSession | undefined;
  let ledger: string[] | null;
  let existing: Set<string>;
  try {
    session = options.open(target.dbUrl);
    ledger = await session.appliedMigrations();
    existing = await session.existingObjects(schemas);
  } catch (err) {
    await session?.close().catch(() => undefined);
    throw new SyncError(
      "Could not connect to the database to compare it with supabase/schemas, so nothing was changed, and the database was not checked against supabase/schemas. Fix the connection (is the database running, is the password right?) and run `devtools db sync` again.",
      redact((err as Error).message),
    );
  }

  try {
    const sql = await liveDiff(product, cli, target, run, log, redact);
    const drift = classifyDiff(sql, existing);

    if (drift.extras.length > 0 && !options.strict) {
      warn(
        `Your database has ${drift.extras.length} thing${drift.extras.length === 1 ? "" : "s"} that supabase/schemas does not define. They are left as they are:\n${listFindings(drift.extras)}\n${cleanupHint(target)}`,
      );
    }
    if (drift.conflicts.length > 0) {
      throw new SyncError(
        `Your database defines ${drift.conflicts.length} thing${drift.conflicts.length === 1 ? "" : "s"} differently from supabase/schemas. devtools will not change them for you, and nothing was changed.`,
        `${listFindings(drift.conflicts)}\nIf the database is right, edit supabase/schemas to match it. If the schema files are right, ${
          target.kind === "local"
            ? "run `devtools db sync --rebuild` (it wipes your development database), then `devtools dev-data`"
            : "reset the project from its dashboard (Database > Settings), then run `devtools db sync` and `devtools dev-data`"
        }.`,
      );
    }
    if (options.strict && drift.extras.length > 0) {
      throw new SyncError(
        `--strict: your database has ${drift.extras.length} thing${drift.extras.length === 1 ? "" : "s"} that supabase/schemas does not define. Nothing was changed or deleted.`,
        `${listFindings(drift.extras)}\n${cleanupHint(target)}`,
      );
    }

    if (drift.restore.length > 0) {
      if (drift.restored.length > 0) {
        log(
          `Your database is missing ${summarize(drift.restored)}; creating ${drift.restored.length === 1 ? "it" : "them"} again from supabase/schemas. Nothing that already exists is changed.`,
        );
      }
      try {
        await session.exec(drift.restore.join(";\n") + ";");
      } catch (err) {
        throw new SyncError(
          "Could not recreate what the database is missing; nothing was changed.",
          `${redact((err as Error).message)}\n${
            target.kind === "local"
              ? "`devtools db sync --rebuild` starts over (it wipes your development database)."
              : "Reset the project from its dashboard (Database > Settings), then run `devtools db sync`."
          }`,
        );
      }
    }

    // The database now holds everything the record describes; say so in the
    // ledger, or `migration up` would run the whole record again. A missing
    // ledger is rewritten from the record, never read as "start over".
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
          redact(repaired.stderr || repaired.stdout),
        );
      }
    }
    return {
      restored: drift.restored,
      extras: drift.extras,
      compared: true,
    };
  } finally {
    await session.close().catch(() => undefined);
  }
}

export async function dbSync(
  product: Product,
  cli: SupabaseCli,
  target: DbTarget,
  run: Runner,
  options: SyncOptions,
): Promise<SyncResult> {
  const log = options.log ?? (() => undefined);
  const warn = options.warn ?? log;
  const redact = redactor(target);
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
      const shown = liveDiffArgs(product, target).map((arg) =>
        arg === target.dbUrl ? "<DB_URL>" : arg,
      );
      log(
        `Would run: ${cliLine(cli, shown)} (and recreate anything the database is missing; extras are only listed)`,
      );
    }
    log(`Would run: ${cliLine(cli, generateArgs.slice(cli.prefix.length))}`);
    log(
      target.kind === "local"
        ? `Would run: ${cliLine(cli, ["migration", "up", "--local"])}`
        : `Would run: ${cliLine(cli, ["db", "push", "--db-url", "<DB_URL>", "--yes"])}`,
    );
    return { migration: null, applied: false, destructive: [], ...NOTHING };
  }

  if (needsRecord) {
    // A brand-new project has no history table yet, and fetch fails: nothing
    // to restore, so the full schema is the right first migration.
    const fetched = await run(cli.command, fetchArgs, { cwd: product.root });
    const restoredFiles = migrationFiles(migrationsDir).length;
    if (fetched.code === 0 && restoredFiles > 0) {
      log(
        `Restored ${restoredFiles} applied migration${restoredFiles === 1 ? "" : "s"} from the project's history.`,
      );
    }
  }

  const live = await reconcileLive(
    product,
    cli,
    target,
    run,
    options,
    log,
    warn,
    redact,
  );
  const restoredSomething = live.restored.length > 0;

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
      redact(generated.stderr || generated.stdout),
    );
  }
  const created = migrationFiles(migrationsDir).filter((f) => !before.has(f));
  if (created.length === 0) {
    // Only a comparison that ran, and found nothing missing or conflicting,
    // may say the database matches. Extras are allowed; they were listed.
    if (live.compared && !restoredSomething) {
      const n = live.extras.length;
      log(
        n === 0
          ? "The database already matches supabase/schemas."
          : `The database matches supabase/schemas, with ${n} extra thing${n === 1 ? "" : "s"} listed above that it does not define.`,
      );
    }
    return {
      migration: null,
      applied: restoredSomething,
      destructive: [],
      ...live,
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
      redact(applied.stderr || applied.stdout),
    );
  }
  return { migration, applied: true, destructive, ...live };
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
