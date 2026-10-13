/**
 * `dev-data`: fill a development database with believable rows (DogPack's fake
 * hosts, and open, full and past sessions for the member's own courses).
 *
 * The product supplies the SQL (`devData.file`); devtools supplies who to
 * run it for. The file reads the signed-in member from a session setting:
 *
 * ```sql
 * select current_setting('devtools.member_id')::uuid;
 * ```
 *
 * `devtools.member_id` is the Supabase `auth.users` id of the member, found as
 * the most recent sign-in through "Sign in with DevDogs" unless `--member`
 * names someone. Nothing is seeded until someone has signed in, which is why
 * this is a command run afterwards and not part of `setup`.
 *
 * It refuses any database that is not the local stack or the contributor's own
 * project, and the SQL runs in one transaction.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Product } from "./config.js";
import { assertNotProduction, type DbTarget, TargetError } from "./target.js";

export class DevDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevDataError";
  }
}

/**
 * Whether `err` is Postgres saying a table or schema does not exist
 * (SQLSTATE 42P01 undefined_table, 3F000 invalid_schema_name): the database
 * has not had the product's schema applied yet.
 */
export function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "3F000";
}

export interface Member {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
}

/** The slice of a SQL client `dev-data` needs, so tests can stand one up. */
export interface SqlSession {
  members(provider: string): Promise<Member[]>;
  memberByRef(ref: string): Promise<Member | null>;
  runAs(memberId: string, sql: string): Promise<void>;
  close(): Promise<void>;
}

export function postgresSession(dbUrl: string): SqlSession {
  const sql = postgres(dbUrl, { max: 1, onnotice: () => undefined });
  return {
    async members(provider) {
      const rows = await sql<
        { id: string; email: string | null; last_sign_in_at: Date | null }[]
      >`
        select u.id, u.email, u.last_sign_in_at
        from auth.users u
        join auth.identities i on i.user_id = u.id
        where i.provider = ${provider}
        order by u.last_sign_in_at desc nulls last
        limit 5`;
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        lastSignInAt: r.last_sign_in_at?.toISOString() ?? null,
      }));
    },
    async memberByRef(ref) {
      const rows = await sql<
        { id: string; email: string | null; last_sign_in_at: Date | null }[]
      >`
        select id, email, last_sign_in_at from auth.users
        where id::text = ${ref} or lower(email) = lower(${ref})
        limit 1`;
      const row = rows[0];
      return row
        ? {
            id: row.id,
            email: row.email,
            lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
          }
        : null;
    },
    async runAs(memberId, text) {
      await sql.begin(async (tx) => {
        await tx`select set_config('devtools.member_id', ${memberId}, true)`;
        await tx.unsafe(text);
      });
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

export interface DevDataOptions {
  /** `--member`: an email or user id, instead of the latest DevDogs sign-in. */
  member?: string | undefined;
  provider: string;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export async function runDevData(
  product: Product,
  target: DbTarget,
  open: (dbUrl: string) => SqlSession,
  options: DevDataOptions,
): Promise<{ member: Member; file: string } | null> {
  const log = options.log ?? (() => undefined);
  const { devData } = product.config;
  if (!devData) {
    throw new DevDataError(
      `${product.config.name} has no dev data: add "devData": { "file": "supabase/dev-data.sql" } to devtools.config.json.`,
    );
  }
  try {
    assertNotProduction(product, target.apiUrl, target.dbUrl);
  } catch (err) {
    if (err instanceof TargetError) throw new DevDataError(err.message);
    throw err;
  }
  const file = join(product.root, devData.file);
  const text = readFileSync(file, "utf8");

  const session = open(target.dbUrl);
  try {
    return await seed(session, devData.file, text, options, log);
  } catch (err) {
    if (isMissingSchemaError(err)) {
      throw new DevDataError(
        `This database does not have ${product.config.name}'s tables yet (${(err as Error).message}). ` +
          "Run `devtools setup` first, or `devtools db sync` if you have already set up.",
      );
    }
    throw err;
  } finally {
    await session.close();
  }
}

async function seed(
  session: SqlSession,
  file: string,
  text: string,
  options: DevDataOptions,
  log: (line: string) => void,
): Promise<{ member: Member; file: string } | null> {
  const member = options.member
    ? await session.memberByRef(options.member)
    : ((await session.members(options.provider))[0] ?? null);
  if (!member) {
    throw new DevDataError(
      options.member
        ? `No user matches ${options.member} in this database.`
        : `Nobody has signed in with DevDogs on this database yet. Start the app, sign in, then run this again (or name someone with --member).`,
    );
  }
  log(`Seeding as ${member.email ?? member.id} (${member.id})`);
  if (options.dryRun) {
    log(
      `Would run ${file} (${text.split("\n").length} lines) in one transaction.`,
    );
    return null;
  }
  await session.runAs(member.id, text);
  return { member, file };
}
