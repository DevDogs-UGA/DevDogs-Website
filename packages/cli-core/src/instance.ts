/**
 * Finding the instance to work against, and signing in to it.
 *
 * `resolveInstance()` is the one entry point every command that needs a
 * Supabase client — `db`'s own commands excepted, which only ever need a
 * Postgres URL — should call. It goes through the SAME session
 * (`resolveDbConnection()`, `db/connection.ts`) `db migrate`/`db reset` do,
 * rather than a local-only `supabase status` probe: every session's env
 * carries `API_URL`/`PUBLISHABLE_KEY`/`SECRET_KEY` alongside `DB_URL` (see
 * `.env.example`), so whichever tier `--tier` named is exactly the instance
 * this resolves to, local Docker included.
 *
 * This replaces `detectLocalInstance()`+`assertMigrated()`, which read
 * `supabase status -o env` directly and therefore only ever found the Docker
 * stack on this machine — the reason `moderation check` and `grant-root`
 * used to be local-only long after `db reset`/`db migrate` moved onto the
 * session system.
 */
import { createClient } from "@supabase/supabase-js";
import { resolveDbConnection, type DbConnection } from "./db/connection.js";
import { findRepoRoot } from "./repo/root.js";

/**
 * The repo root, which is where `supabase/config.toml` lives.
 *
 * The Supabase CLI walks up from its working directory looking for that file,
 * and falls back to `basename(cwd)` as the project name when it finds none, so
 * running it from the wrong place fails with "No such container:
 * supabase_db_<whatever directory you were in>". Resolved via `findRepoRoot()`
 * (walking up from `process.cwd()`, not this source file — see `repo/root.ts`)
 * so it does not matter where the contributor invoked the tool from.
 */
export { findRepoRoot };

/**
 * Every client here goes through this one factory so they all share a type.
 *
 * supabase-js encodes the default schema in the client's type, so a `schema`
 * parameter of type `string` produces a client that will not unify with a
 * hand-written `SupabaseClient` annotation. Deriving `DevtoolsClient` from the
 * factory sidesteps that.
 */
function makeClient(url: string, key: string, schema: string) {
  return createClient(url, key, {
    db: { schema },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type DevtoolsClient = ReturnType<typeof makeClient>;

export interface Instance {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
}

/** The built-in Root role, from `supabase/seed/production/01_roles.sql`. */
export const ROOT_ROLE_ID = "00000000-0000-0000-0000-000000000002";

export interface ResolvedInstance {
  connection: DbConnection;
  instance: Instance;
}

export interface ResolveInstanceOptions {
  /** Stderr prefix, e.g. "devtools grant-root". */
  label?: string;
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the session's database AND the Supabase client credentials for it.
 *
 * Goes through `resolveDbConnection()` first — the exact check `db
 * migrate`/`db reset` run, including the local-stack-offline and
 * inherited-development-values guards — so a caller here refuses in exactly
 * the same situations and with the same messages those commands already do.
 * What this adds is reading `API_URL`/`PUBLISHABLE_KEY`/`SECRET_KEY` out of
 * the same already-entered session env `DB_URL` came from (see this file's
 * header), rather than shelling out to `supabase status` — which is what
 * makes hosted tiers reachable here at all.
 *
 * Returns `null` after reporting the reason on stderr, same contract as
 * `resolveDbConnection` — never throws for an expected failure.
 */
export async function resolveInstance(
  opts: ResolveInstanceOptions = {},
): Promise<ResolvedInstance | null> {
  const label = opts.label ?? "devtools";
  const connection = await resolveDbConnection({ label: opts.label });
  if (!connection) return null;

  const env = opts.env ?? process.env;
  const apiUrl = env.API_URL;
  const publishableKey = env.PUBLISHABLE_KEY;
  const secretKey = env.SECRET_KEY;

  if (!apiUrl || !publishableKey || !secretKey) {
    process.stderr.write(
      `${label}: this session has a DB_URL but no API_URL/PUBLISHABLE_KEY/` +
        "SECRET_KEY — run `pnpm devtools env pull` for this tier, or " +
        "`pnpm devtools db start` for the local stack.\n",
    );
    return null;
  }

  return { connection, instance: { apiUrl, publishableKey, secretKey } };
}

/** A service-role client. Bypasses RLS, so setup and teardown only. */
export function adminClient(
  instance: Instance,
  schema = "platform",
): DevtoolsClient {
  return makeClient(instance.apiUrl, instance.secretKey, schema);
}

/**
 * A client signed in with a real email/password, subject to RLS.
 *
 * Signs in for real rather than hand-signing a JWT, so the token path exercised
 * is the one production uses, with whatever claims Supabase Auth actually puts
 * in a token rather than the ones we assume. Takes the password explicitly —
 * there is no fixed persona password any more (see `persona.ts` and
 * `moderation.ts`'s `withTemporaryModerator`, both of which generate a fresh
 * random one per account).
 */
export async function signedInClient(
  instance: Instance,
  email: string,
  password: string,
  schema = "platform",
): Promise<DevtoolsClient> {
  const client = makeClient(instance.apiUrl, instance.publishableKey, schema);

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Could not sign in as ${email}: ${error.message}.`);
  }
  return client;
}
