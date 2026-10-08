// No database imports here: `cloudflare/scheduled.ts` imports this module's
// types, and the Worker entry's typecheck must not reach `~/server/db`. The
// reads and writes are in `./index.ts`.

/**
 * The daily background jobs, by their row in `platform."jobHeartbeats"`, and
 * how long each may go without a success before it counts as overdue.
 *
 * Sentry bills every active Crons monitor as a seat and the plan covers one,
 * which the fifteen-minute cron (`platform-cron-config-reconcile`) keeps. The
 * daily jobs report through it instead: each writes its row when a run
 * succeeds, and `/cron/heartbeats`, fired in that fifteen-minute slot, fails
 * while any row is older than its allowance. The failure marks the monitor's
 * check-in as an error, so a job that stopped running alerts like one that
 * crashed. A crash also raises its own Sentry issue at the time; this is what
 * catches a run that never started.
 *
 * Twenty-six hours is a day plus room for a slow run: the nightly repair
 * spaces ~42 upstream requests, and the scrape has taken over twenty minutes.
 *
 * The names are the monitor slugs the jobs used to check in to. A job added
 * here needs a seeded row in its migration, or the first check reports it
 * overdue before it has had a chance to run.
 */
export const JOB_HEARTBEATS = {
  // `cloudflare/scheduled.ts`'s "0 0 * * *" group, recorded by the dispatcher
  // once every route in it succeeds.
  "platform-nightly-repair": { maxAgeHours: 26 },
  // DevDogsUGA's schedule-builder `ScrapeWorkflow`, at 14:05 UTC, recorded by
  // its last step over the shared database connection.
  "schedule-builder-scrape": { maxAgeHours: 26 },
} as const satisfies Record<string, { maxAgeHours: number }>;

export type HeartbeatJob = keyof typeof JOB_HEARTBEATS;

export function isHeartbeatJob(job: unknown): job is HeartbeatJob {
  return typeof job === "string" && Object.hasOwn(JOB_HEARTBEATS, job);
}

export interface OverdueJob {
  job: HeartbeatJob;
  /** `null` when the job has no row at all. */
  lastSucceededAt: string | null;
}

/**
 * The jobs in `JOB_HEARTBEATS` whose last success is older than their
 * allowance at `now`. A job with no row is overdue: the migration seeds every
 * job's row, so a missing one was deleted, and nothing would ever say so.
 * Rows for jobs not listed are ignored.
 */
export function overdueJobs(
  rows: readonly { job: string; succeededAt: Date }[],
  now: Date,
): OverdueJob[] {
  const last = new Map(rows.map((row) => [row.job, row.succeededAt]));
  const overdue: OverdueJob[] = [];
  for (const [job, { maxAgeHours }] of Object.entries(JOB_HEARTBEATS)) {
    const succeededAt = last.get(job);
    if (
      !succeededAt ||
      now.getTime() - succeededAt.getTime() > maxAgeHours * 60 * 60 * 1000
    ) {
      overdue.push({
        job: job as HeartbeatJob,
        lastSucceededAt: succeededAt?.toISOString() ?? null,
      });
    }
  }
  return overdue;
}
