import { sql } from "drizzle-orm";
import type { db } from "~/server/db";
import { jobHeartbeats } from "~/server/db/schema";
import type { HeartbeatJob } from "./jobs";

export * from "./jobs";

export async function readHeartbeats(database: typeof db) {
  return database.select().from(jobHeartbeats);
}

/** Records a success of `job` now, by the database's clock. */
export async function recordHeartbeat(
  database: typeof db,
  job: HeartbeatJob,
): Promise<void> {
  await database
    .insert(jobHeartbeats)
    .values({ job, succeededAt: sql`now()` })
    .onConflictDoUpdate({
      target: jobHeartbeats.job,
      set: { succeededAt: sql`now()` },
    });
}
