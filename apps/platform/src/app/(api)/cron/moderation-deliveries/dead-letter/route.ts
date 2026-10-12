import { NextResponse, connection } from "next/server";
import { authorizeCron } from "~/server/moderation/cronAuth";
import { markDeadLettered } from "~/server/moderation/deadLetter";
import { readDeliveryId } from "~/server/moderation/queueMessage";

/**
 * POST /cron/moderation-deliveries/dead-letter `{ "deliveryId": "<uuid>" }`
 *
 * A delivery used up its queue retries. The row becomes `failed`, which the
 * console shows with a resend button, and `postAlert` raises it to the
 * officers. Called by the dead-letter queue's consumer (`cloudflare/queue.ts`).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
 */
export async function POST(request: Request) {
  await connection();
  authorizeCron(request);

  const deliveryId = await readDeliveryId(request);
  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
  }

  await markDeadLettered(deliveryId);
  return NextResponse.json({ ack: true });
}
