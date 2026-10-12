import postgres from "postgres";

/**
 * How long a catalog read may run, in milliseconds. The `catalog_reader`
 * role carries the same limit for a direct login (migration 62), but Postgres
 * does not apply a role's defaults under `SET ROLE`, so each read sets it again.
 */
export const READ_STATEMENT_TIMEOUT_MS = 3000;

/** The query function a read gets: postgres.js's tagged template, inside a read-only transaction. */
export type ReadSql = postgres.TransactionSql;

/**
 * Runs `fn` as the read-only `catalog_reader` role.
 *
 * The Worker connects as `postgres` (through Hyperdrive in the deployed
 * environments), which can write. Every read therefore happens in a
 * `READ ONLY` transaction that first drops to `catalog_reader`, a role that can
 * see the `uga` views and nothing else, with a short statement timeout.
 * `SET LOCAL` keeps all three scoped to the transaction, so a pooled connection
 * goes back to Hyperdrive as it came.
 *
 * `fetch_types: false` skips the driver's catalog query at connect (arrays are
 * passed with explicit type OIDs, see `queries.ts`). One connection per
 * request: Hyperdrive owns the pool.
 */
export async function withCatalogReader<T>(
  url: string,
  fn: (sql: ReadSql) => Promise<T>,
): Promise<T> {
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    fetch_types: false,
    // A stop-word query ("the") makes Postgres send a NOTICE; the driver would
    // print the object into the Worker log on every such request.
    onnotice: () => undefined,
  });
  try {
    return (await client.begin("read only", async (tx) => {
      await tx`set local role catalog_reader`;
      await tx`select set_config('statement_timeout', ${String(READ_STATEMENT_TIMEOUT_MS)}, true)`;
      return fn(tx);
    })) as T;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

/** True for the errors a read gets when its statement timeout fires or the database is saturated. */
export function isUnavailableError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === "57014" || // query_canceled: statement_timeout
    code === "53300" || // too_many_connections
    code === "57P01" || // admin_shutdown
    code === "08006" ||
    code === "CONNECT_TIMEOUT" ||
    code === "CONNECTION_CLOSED" ||
    code === "CONNECTION_DESTROYED"
  );
}
