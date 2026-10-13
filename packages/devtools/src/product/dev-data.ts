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
import { signatureOf, type LivePrivileges } from "./drift.js";
import { assertNotProduction, type DbTarget, TargetError } from "./target.js";

export class DevDataError extends Error {
  /** A failure the contributor or the product's SQL caused, not a devtools bug: never sent to Sentry. */
  readonly expected = true;
  constructor(message: string) {
    super(message);
    this.name = "DevDataError";
  }
}

/**
 * Whether `err` is the product's own SQL being wrong: a Postgres error whose
 * SQLSTATE class is a cardinality violation (21), data exception (22),
 * integrity constraint violation (23) or syntax error or access rule
 * violation (42). Everything else is not the file's fault and reports as a
 * normal failure: a refused or dropped connection (class 08 and
 * `ECONNREFUSED`), an operator shutdown (57, `admin_shutdown`), a server out
 * of resources (53), a transaction that was rolled back (40), and so on.
 */
export function isSqlFileError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(21|22|23|42)[0-9A-Z]{3}$/.test(code);
}

/**
 * The line of `text` a Postgres error points at, from the error's 1-based
 * character `position`, or null when it carries none.
 */
export function errorLine(err: unknown, text: string): number | null {
  const raw = (err as { position?: unknown } | null)?.position;
  const position = typeof raw === "string" ? Number(raw) : raw;
  if (typeof position !== "number" || !Number.isInteger(position)) return null;
  if (position < 1 || position > text.length + 1) return null;
  return text.slice(0, position - 1).split("\n").length;
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
  /**
   * Versions in the target's `supabase_migrations.schema_migrations` ledger,
   * or null when the database has no ledger at all (never migrated, or reset).
   */
  appliedMigrations(): Promise<string[] | null>;
  /** Which of `schemas` do not exist in this database. */
  missingSchemas(schemas: readonly string[]): Promise<string[]>;
  /**
   * Functions, views and triggers in `schemas`, keyed `function:schema.name`,
   * `view:schema.name`, `trigger:schema.table:name`. Lets a diff tell a
   * missing function from a changed one.
   */
  existingObjects(schemas: readonly string[]): Promise<Set<string>>;
  /** Column types in `schemas`, keyed `schema.table.column`, as Postgres spells them (`format_type`). */
  columnTypes(schemas: readonly string[]): Promise<Map<string, string>>;
  /**
   * What each role can do with the tables, sequences, functions and schemas
   * (and columns) in `schemas`: `schema.table`, `schema.table.column`,
   * `schema.fn(types)` or a schema name -> role (`public` for PUBLIC) ->
   * privileges, upper case. Read from the ACLs, defaults included.
   */
  privileges(schemas: readonly string[]): Promise<LivePrivileges>;
  /** Runs `sql` as is, in one transaction. */
  exec(sql: string): Promise<void>;
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
    async appliedMigrations() {
      const [table] = await sql<{ present: string | null }[]>`
        select to_regclass('supabase_migrations.schema_migrations')::text as present`;
      if (!table?.present) return null;
      const rows = await sql<{ version: string }[]>`
        select version from supabase_migrations.schema_migrations`;
      return rows.map((r) => r.version);
    },
    async missingSchemas(schemas) {
      const rows = await sql<{ nspname: string }[]>`
        select nspname from pg_namespace where nspname = any(${[...schemas]})`;
      const present = new Set(rows.map((r) => r.nspname));
      return schemas.filter((name) => !present.has(name));
    },
    async existingObjects(schemas) {
      const list = [...schemas];
      const found = new Set<string>();
      const functions = await sql<{ s: string; n: string; sig: string }[]>`
        select n.nspname as s, p.proname as n,
               oidvectortypes(p.proargtypes) as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any(${list}) and p.prokind in ('f', 'p')`;
      for (const r of functions) {
        found.add(`function:${r.s}.${r.n}`);
        // Which overload: functions of one name differ by argument types.
        found.add(`signature:${r.s}.${r.n}(${r.sig})`);
      }
      const views = await sql<{ s: string; n: string }[]>`
        select n.nspname as s, c.relname as n from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any(${list}) and c.relkind in ('v', 'm')`;
      for (const r of views) found.add(`view:${r.s}.${r.n}`);
      const triggers = await sql<{ s: string; t: string; n: string }[]>`
        select n.nspname as s, c.relname as t, g.tgname as n from pg_trigger g
        join pg_class c on c.oid = g.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any(${list}) and not g.tgisinternal`;
      for (const r of triggers) found.add(`trigger:${r.s}.${r.t}:${r.n}`);
      return found;
    },
    async columnTypes(schemas) {
      const rows = await sql<
        { s: string; t: string; c: string; type: string }[]
      >`
        select n.nspname as s, c.relname as t, a.attname as c,
               format_type(a.atttypid, a.atttypmod) as type
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any(${[...schemas]}) and c.relkind in ('r', 'p', 'f')
          and a.attnum > 0 and not a.attisdropped`;
      return new Map(rows.map((r) => [`${r.s}.${r.t}.${r.c}`, r.type]));
    },
    async privileges(schemas) {
      const list = [...schemas];
      const out = new Map<string, Map<string, Set<string>>>();
      const add = (key: string, role: string | null, priv: string) => {
        const roles = out.get(key) ?? new Map<string, Set<string>>();
        out.set(key, roles);
        const name = role ?? "public";
        const set = roles.get(name) ?? new Set<string>();
        roles.set(name, set);
        set.add(priv);
      };
      type Row = { key: string; role: string | null; priv: string };
      const relations = await sql<Row[]>`
        select n.nspname || '.' || c.relname as key, r.rolname as role,
               a.privilege_type as priv
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl, acldefault(
          case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end,
          c.relowner))) a
        left join pg_roles r on r.oid = a.grantee
        where n.nspname = any(${list})
          and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')`;
      for (const r of relations) add(r.key, r.role, r.priv);
      const columns = await sql<Row[]>`
        select n.nspname || '.' || c.relname || '.' || t.attname as key,
               r.rolname as role, a.privilege_type as priv
        from pg_attribute t
        join pg_class c on c.oid = t.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(t.attacl) a
        left join pg_roles r on r.oid = a.grantee
        where n.nspname = any(${list}) and t.attacl is not null
          and t.attnum > 0 and not t.attisdropped`;
      for (const r of columns) add(r.key, r.role, r.priv);
      const functions = await sql<(Row & { args: string })[]>`
        select n.nspname || '.' || p.proname as key, r.rolname as role,
               a.privilege_type as priv,
               pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl,
          acldefault('f'::"char", p.proowner))) a
        left join pg_roles r on r.oid = a.grantee
        where n.nspname = any(${list}) and p.prokind in ('f', 'p')`;
      for (const r of functions) {
        add(`${r.key}${signatureOf(r.args)}`, r.role, r.priv);
      }
      const schemaRows = await sql<Row[]>`
        select n.nspname as key, r.rolname as role, a.privilege_type as priv
        from pg_namespace n
        cross join lateral aclexplode(coalesce(n.nspacl,
          acldefault('n'::"char", n.nspowner))) a
        left join pg_roles r on r.oid = a.grantee
        where n.nspname = any(${list})`;
      for (const r of schemaRows) add(r.key, r.role, r.priv);
      return out;
    },
    async exec(text) {
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
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
    // Checked before any statement of the file runs, so "the schema is not
    // here yet" can never be confused with a mistake in the product's SQL.
    const missing = await session.missingSchemas(
      product.config.supabase.schemas,
    );
    if (missing.length > 0) {
      throw new DevDataError(
        `This database does not have ${product.config.name}'s ${missing.length === 1 ? "schema" : "schemas"} yet (missing: ${missing.join(", ")}). ` +
          "Run `devtools setup` first, or `devtools db sync` if you have already set up.",
      );
    }
    return await seed(session, devData.file, text, options, log);
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
  // Only the file's own execution is wrapped: the lookups above and the
  // connection they use are not the product's SQL, so their failures are not
  // blamed on it.
  try {
    await session.runAs(member.id, text);
  } catch (err) {
    // The file is the product's own SQL: say what Postgres said and where.
    if (!isSqlFileError(err)) throw err;
    const line = errorLine(err, text);
    throw new DevDataError(
      `${file}${line === null ? "" : `:${line}`}: ${(err as Error).message}. ` +
        "This is a problem in the product's dev-data SQL, not in devtools; nothing was seeded (the file runs in one transaction).",
    );
  }
  return { member, file };
}
