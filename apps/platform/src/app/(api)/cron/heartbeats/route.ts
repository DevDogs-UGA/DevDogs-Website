import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  isHeartbeatJob,
  overdueJobs,
  readHeartbeats,
  recordHeartbeat,
} from "~/server/heartbeats";

/**
 * GET /cron/heartbeats
 *
 * Fails with a 500 while any daily job in `JOB_HEARTBEATS` has gone longer
 * than its allowance without a success. Fired in the fifteen-minute cron
 * slot, so the failure errors that slot's Sentry Crons monitor, the one
 * monitor the plan pays for. Every run that finds a job overdue fails until
 * the job succeeds again; the monitor groups the failures into one issue.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally
 * -- the same convention every other cron route in this directory follows.
 */
export async function GET(request: Request) {
  await connection();
  authorize(request);

  const overdue = overdueJobs(await readHeartbeats(db), new Date());
  if (overdue.length > 0) {
    // The monitor's issue says only that the slot failed; this line, which
    // the Worker forwards to Sentry Logs, says which job and since when.
    console.error("job_heartbeats_overdue", { overdue });
    return NextResponse.json({ success: false, overdue }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/**
 * POST /cron/heartbeats `{ "job": "<name>" }`
 *
 * Records a success of a job the platform runs itself. Called by
 * `cloudflare/scheduled.ts` once every route of a group that declares a
 * `heartbeat` has succeeded. The schedule-builder's scrape writes its row
 * directly instead, over the database connection both Workers share.
 */
export async function POST(request: Request) {
  await connection();
  authorize(request);

  const body: unknown = await request.json().catch(() => null);
  const job =
    typeof body === "object" && body !== null && "job" in body
      ? body.job
      : undefined;
  if (!isHeartbeatJob(job)) {
    return NextResponse.json(
      { success: false, reason: "unknown_job" },
      { status: 400 },
    );
  }

  await recordHeartbeat(db, job);
  return NextResponse.json({ success: true, job });
}

function authorize(request: Request) {
  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }
}
