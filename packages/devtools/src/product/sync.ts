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
  if (options.dryRun) {
    log(`Would run: ${cliLine(cli, generateArgs.slice(cli.prefix.length))}`);
    log(
      target.kind === "local"
        ? `Would run: ${cliLine(cli, ["migration", "up", "--local"])}`
        : `Would run: ${cliLine(cli, ["db", "push", "--db-url", "<DB_URL>", "--yes"])}`,
    );
    return { migration: null, applied: false, destructive: [] };
  }

  const before = new Set(migrationFiles(migrationsDir));
  const generated = await run(cli.command, generateArgs, { cwd: product.root });
  if (generated.code !== 0) {
    throw new SyncError(
      /docker|container|image/i.test(generated.stderr + generated.stdout)
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

/** Forgets what was applied: removes the git-ignored local migrations. */
export function forgetMigrations(product: Product): string[] {
  const files = migrationFiles(product.paths.migrationsDir);
  for (const file of files) rmSync(join(product.paths.migrationsDir, file));
  return files;
}
