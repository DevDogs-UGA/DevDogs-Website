import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/**
 * The scrape's Drizzle client, on an explicit connection string.
 *
 * `prepare: false` keeps it compatible with Hyperdrive and the Supabase
 * poolers, as every client in this repo is. `idle_timeout` lets the driver reap
 * a socket nobody closed. A Workflow step has no per-request context to key a
 * cached client on and may resume in a fresh isolate, so each step builds its
 * own and must close it: use {@link withScrapeDb}.
 */
export function createScrapeDb(url: string, max = 5) {
  const client = postgres(url, { prepare: false, idle_timeout: 20, max });
  return drizzle({ client, schema });
}

export type ScrapeDb = ReturnType<typeof createScrapeDb>;

/** The transaction handle `ScrapeDb.transaction` passes to its callback. */
export type ScrapeTx = Parameters<Parameters<ScrapeDb["transaction"]>[0]>[0];

/**
 * Runs `fn` with a fresh client and closes it afterwards, so a step that throws
 * does not leave a pool for the garbage collector. The pool's sockets and
 * buffers are what filled the isolate heap in the OOM investigation
 * (SCHEDULE-BUILDER-1) before the scrape's own rows did.
 */
export async function withScrapeDb<T>(
  url: string,
  fn: (db: ScrapeDb) => Promise<T>,
  max = 5,
): Promise<T> {
  const db = createScrapeDb(url, max);
  try {
    return await fn(db);
  } finally {
    await db.$client.end({ timeout: 5 }).catch(() => undefined);
  }
}
