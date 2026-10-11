import { sql } from "drizzle-orm";
import type { ScrapeDb } from "~/db/client";

/**
 * The registrar scrape's row in `platform."jobHeartbeats"`. The platform's
 * fifteen-minute cron reports a job overdue through its Sentry Crons monitor
 * once the row is older than 26 hours (apps/platform/src/server/heartbeats/jobs.ts),
 * so the scrape has no monitor of its own (Sentry bills a seat per monitor).
 *
 * The name is the monitor slug the scrape once checked in to, and it stays
 * `schedule-builder-scrape` so moving the scrape out of schedule-builder
 * changes nothing the platform watches.
 */
export const SCRAPE_HEARTBEAT_JOB = "schedule-builder-scrape";

/**
 * The Bulletin program sync's row. The platform's nightly-repair group used to
 * run it, so `platform-nightly-repair` covered it; now it is its own job and
 * its own row, which migration 55 seeds.
 */
export const PROGRAMS_HEARTBEAT_JOB = "catalog-academic-programs";

/**
 * Records a success of `job` now, by the database's clock. Written only when
 * every invariant of the run held: a run that violated one writes nothing, the
 * row ages, and the platform reports it. Raw SQL because the table is the
 * platform's, outside the schemas the catalog's Drizzle client describes.
 */
export async function recordHeartbeat(
  db: ScrapeDb,
  job: string,
): Promise<void> {
  await db.execute(sql`
    insert into platform."jobHeartbeats" ("job", "succeededAt")
    values (${job}, now())
    on conflict ("job") do update set "succeededAt" = excluded."succeededAt"
  `);
}

/** How many runs of a job `uga."scrapeRuns"` keeps. A year of dailies, with room. */
export const SCRAPE_RUNS_KEPT = 400;

/**
 * Stores a finished run: whether it was clean, and the per-term report (counts,
 * invariants, building coverage). Written for failing runs too, which is the
 * point: the heartbeat says "no success since", this says why. Old rows are
 * trimmed in the same statement.
 */
export async function recordRun(
  db: ScrapeDb,
  run: {
    job: string;
    startedAt: Date;
    ok: boolean;
    report: unknown;
  },
): Promise<void> {
  await db.execute(sql`
    with inserted as (
      insert into uga."scrapeRuns" ("job", "startedAt", "ok", "report")
      values (${run.job}, ${run.startedAt.toISOString()}::timestamptz, ${run.ok}, ${JSON.stringify(run.report)}::jsonb)
      returning id
    )
    delete from uga."scrapeRuns"
    where "job" = ${run.job}
      and id not in (
        select id from uga."scrapeRuns" where "job" = ${run.job}
        order by "finishedAt" desc, id desc limit ${SCRAPE_RUNS_KEPT}
      )
  `);
}
