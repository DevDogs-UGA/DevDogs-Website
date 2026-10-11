import { NextResponse, connection } from "next/server";
import { authorizeCron } from "~/server/moderation/cronAuth";
import { requeueStaleDeliveries } from "~/server/moderation/queue";

/**
 * GET /cron/moderation-deliveries
 *
 * The fifteen-minute pass that makes the delivery queue lossless: a decision
 * commits its deliveries as pending rows and queues them afterwards, so a row
 * the queue never received (or lost) is found here and queued again.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
 */
export async function GET(request: Request) {
  await connection();
  authorizeCron(request);

  const requeued = await requeueStaleDeliveries();
  if (requeued > 0)
    console.warn("moderation_deliveries_requeued", { requeued });
  return NextResponse.json({ success: true, requeued });
}
