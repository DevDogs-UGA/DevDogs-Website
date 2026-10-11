import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

/**
 * A throwaway Postgres database with exactly what the catalog needs, built from
 * the repository's own definitions, for the `*.db-test.ts` files.
 *
 * `DB_URL` is an admin connection to a server with Supabase's roles (the local
 * stack, or the same image in a container). Each test file creates its own
 * database on that server, loads `supabase/schemas` into it (the registrar
 * tables, the `uga` schema, and the two platform tables the scrape touches),
 * runs migration 58 for the role, and drops the database afterwards. Nothing in
 * the database `DB_URL` names is read or written, and no migration history is
 * needed, so this works the same against a fresh `supabase start` and a bare
 * container.
 */

const SUPABASE = resolve(import.meta.dirname, "../../../../supabase");
const SCHEMAS = join(SUPABASE, "schemas");

/** The files to load, in an order that satisfies most dependencies; the loader retries the rest. */
function schemaFiles(): string[] {
  const dir = (path: string): string[] =>
    existsSync(join(SCHEMAS, path))
      ? readdirSync(join(SCHEMAS, path))
          // The `user*` tables are DogDays' and read `auth.uid()`: not the catalog's.
          .filter((f) => f.endsWith(".sql") && !f.startsWith("user"))
          .sort()
          .map((f) => join(path, f))
      : [];
  return [
    "schedule_builder/schema.sql",
    "schedule_builder/default_privileges.sql",
    ...dir("schedule_builder/types"),
    ...dir("schedule_builder/sequences"),
    ...dir("schedule_builder/tables"),
    ...dir("schedule_builder/views"),
    "platform/schema.sql",
    "platform/types/academicProgramCategory.sql",
    "platform/tables/academicPrograms.sql",
    "platform/tables/jobHeartbeats.sql",
    "uga/schema.sql",
    ...dir("uga/tables"),
    ...dir("uga/views"),
  ];
}

/** The catalog's migration: the role, and the heartbeat row. Found by name so a renumbering does not break it. */
function catalogMigration(): string {
  const file = readdirSync(join(SUPABASE, "migrations")).find((f) =>
    f.includes("catalog_reader"),
  );
  if (!file)
    throw new Error("No catalog_reader migration in supabase/migrations.");
  return join(SUPABASE, "migrations", file);
}

export function adminUrl(): string {
  const url = process.env.DB_URL;
  if (!url) {
    throw new Error(
      "DB_URL is not set. Point it at a Postgres server with Supabase's roles, for example the local stack: postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
  }
  return url;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export type TestDatabase = {
  /** A connection string for the throwaway database, as `postgres`. */
  url: string;
  /** Drops the database. */
  drop(): Promise<void>;
};

/** Loads every file, retrying the ones that fail until a pass makes no progress. */
async function loadSchemas(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    let pending = schemaFiles();
    let lastErrors: string[] = [];
    while (pending.length > 0) {
      const failed: string[] = [];
      lastErrors = [];
      for (const file of pending) {
        try {
          await sql.unsafe(readFileSync(join(SCHEMAS, file), "utf8"));
        } catch (error) {
          failed.push(file);
          lastErrors.push(`${file}: ${(error as Error).message}`);
        }
      }
      if (failed.length === pending.length) {
        throw new Error(
          `Schema files that cannot load:\n${lastErrors.join("\n")}`,
        );
      }
      pending = failed;
    }
    await sql.unsafe(readFileSync(catalogMigration(), "utf8"));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = adminUrl();
  const name = `catalog_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const control = postgres(admin, { max: 1 });
  try {
    await control.unsafe(`create database ${name}`);
  } finally {
    await control.end({ timeout: 5 });
  }
  const url = withDatabase(admin, name);
  try {
    await loadSchemas(url);
  } catch (error) {
    await dropDatabase(admin, name);
    throw error;
  }
  return { url, drop: () => dropDatabase(admin, name) };
}

async function dropDatabase(admin: string, name: string): Promise<void> {
  const control = postgres(admin, { max: 1 });
  try {
    await control.unsafe(`drop database if exists ${name} with (force)`);
  } finally {
    await control.end({ timeout: 5 });
  }
}
