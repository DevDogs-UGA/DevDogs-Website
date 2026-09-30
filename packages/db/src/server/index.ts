import "server-only";

import {
  createClient as supabaseCreateClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { AnyRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ClientOptions, DatabaseSchema } from "../client/index.js";

export type { ClientOptions, DatabaseSchema };

/**
 * Service-role admin Supabase client. Bypasses RLS, so it is server-only —
 * this module's `import "server-only"` makes an accidental browser import
 * fail at build rather than leak the service key at runtime. Session
 * auto-refresh/persistence are disabled.
 */
export function createAdminClient<Database, S extends DatabaseSchema<Database>>(
  opts: ClientOptions<Database, S>,
) {
  const options: SupabaseClientOptions<S> = {
    db: { schema: opts.schema },
    auth: { autoRefreshToken: false, persistSession: false },
  };
  // supabase-js types the options' schema slot with a conditional that TS
  // can't collapse against a generic `S`; the runtime schema is correct
  // (db.schema === opts.schema) and the return type stays scoped to `S`.
  return supabaseCreateClient<Database, S>(
    opts.url,
    opts.key,
    options as never,
  );
}

/**
 * The connection options every app shares.
 *
 * `prepare: false` keeps the application clients compatible with both
 * Supabase poolers and Hyperdrive without relying on server-side prepared
 * statement state. Drizzle Kit uses its own direct connection configuration.
 *
 * `idle_timeout` lets postgres.js reap an idle socket on its own. Request
 * clients are typically closed explicitly once their response is sent, so
 * this is a backstop: it caps how long a pool that outlives its close — or
 * the long-lived dev/cached client between edits — keeps a connection open,
 * rather than holding one for the isolate's lifetime.
 */
const CONNECTION_OPTIONS = { prepare: false, idle_timeout: 20 } as const;

/**
 * Connections are cached on `globalThis` so a dev-server's module reloads
 * reuse one pool instead of opening a new one per edit. Keyed by URL rather
 * than stored under a bare slot: more than one app/package can call this
 * factory, and an unkeyed slot would let the second caller silently inherit
 * the first caller's connection, including its database.
 */
const CACHE_KEY = Symbol.for("@devdogsuga/db.connections");

type ConnectionCache = Map<string, ReturnType<typeof postgres>>;

function connectionCache(): ConnectionCache {
  const g = globalThis as unknown as Record<
    symbol,
    ConnectionCache | undefined
  >;
  return (g[CACHE_KEY] ??= new Map());
}

export interface CreateDbOptions {
  /**
   * Whether to cache the connection on `globalThis`. Defaults to true outside
   * production, matching the pre-migration per-app behaviour: in production
   * the module graph is built once, so the cache buys nothing and only keeps
   * a reference alive.
   */
  cache?: boolean;
  /** Maximum connections opened by this client. */
  max?: number;
}

/**
 * Builds the Drizzle client for an app.
 *
 * Each app passes its own generated `relations`, because different apps
 * introspect different Postgres schemas and their generated modules are not
 * interchangeable. Everything else lives here so it can only be configured
 * one way: driver, pooling behaviour, hot-reload caching.
 */
export function createDb<TRelations extends AnyRelations>(
  url: string,
  relations: TRelations,
  { cache = process.env.NODE_ENV !== "production", max }: CreateDbOptions = {},
) {
  const cached = cache ? connectionCache().get(url) : undefined;
  const options =
    max === undefined ? CONNECTION_OPTIONS : { ...CONNECTION_OPTIONS, max };
  const client = cached ?? postgres(url, options);

  if (cache && !cached) connectionCache().set(url, client);

  return drizzle({ client, relations });
}
