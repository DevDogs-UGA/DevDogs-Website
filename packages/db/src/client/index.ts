import {
  createBrowserClient as ssrCreateBrowserClient,
  createServerClient as ssrCreateServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";

/**
 * Any schema exposed by a generated `Database` type.
 *
 * `Database` carries a generated `__InternalSupabase` key (PostgREST version
 * metadata) that is not a real schema; the supabase-js/ssr client generics
 * constrain their schema parameter with the same `Omit`, so stripping it here
 * keeps `S` assignable to them.
 *
 * `Database` is supplied by the consumer (their own generated
 * `database.types.ts` — see `@devdogsuga/db/typegen`) rather than shipped by
 * this package: the generated types are repo data, not framework.
 */
export type DatabaseSchema<Database> = keyof Omit<
  Database,
  "__InternalSupabase"
> &
  string;

export interface ClientOptions<Database, S extends DatabaseSchema<Database>> {
  /** Supabase API URL (e.g. `env.API_URL` / `env.NEXT_PUBLIC_SUPABASE_URL`). */
  url: string;
  /** Publishable/anon key for browser & server clients; secret key for admin. */
  key: string;
  /** The app's Postgres schema. Becomes the client's default for `.from()`. */
  schema: S;
}

/**
 * Browser (anon) client, scoped to `schema` as its default.
 *
 * `@supabase/ssr` caches this in the browser, but NOT on the arguments: it
 * keeps ONE module-level slot and returns whatever landed there first, without
 * comparing url, key or schema. So a second call with a different `schema`
 * silently hands back the first client, still pointed at the first schema.
 *
 * That is survivable only when each app runs in its own page and calls this
 * with one schema, the constant from its own schema map. Calling it with two
 * different schemas in one app would not fail; it would quietly query the
 * wrong one. Use a separate client from `@supabase/supabase-js` if a second
 * schema is ever needed on the client.
 */
export function createBrowserClient<
  Database,
  S extends DatabaseSchema<Database>,
>(opts: ClientOptions<Database, S>) {
  return ssrCreateBrowserClient<Database, S>(opts.url, opts.key, {
    db: { schema: opts.schema },
  });
}

/**
 * Cookie-backed server client (RSC / Route Handlers / Server Actions),
 * scoped to `schema`. The caller supplies the framework's cookie adapter.
 */
export function createServerClient<
  Database,
  S extends DatabaseSchema<Database>,
>(opts: ClientOptions<Database, S> & { cookies: CookieMethodsServer }) {
  return ssrCreateServerClient<Database, S>(opts.url, opts.key, {
    db: { schema: opts.schema },
    cookies: opts.cookies,
  });
}
