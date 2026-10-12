import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { attemptDelivery } from "~/server/moderation/delivery";
import { databaseDeliveryStore } from "~/server/moderation/deliveryStore";
import { authorizeCron } from "~/server/moderation/cronAuth";
import { readDeliveryId } from "~/server/moderation/queueMessage";

/**
 * POST /cron/moderation-deliveries/deliver `{ "deliveryId": "<uuid>" }`
 *
 * One attempt to send one delivery. Called by the Worker's own queue consumer
 * (`cloudflare/queue.ts`), which acks or retries the queue message from the
 * answer: `{ "ack": true }` or `{ "ack": false, "retryAfterSeconds": n }`.
 * A thrown error is a 500, which the consumer also retries.
 *
 * It goes through the Worker's own HTTP surface, not straight to the database
 * from the consumer, so a delivery runs with the same database client, error
 * reporting and request scope as everything else the platform does.
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

  const outcome = await attemptDelivery(deliveryId, {
    store: databaseDeliveryStore,
    signingKey: env.MODERATION_SIGNING_KEY,
  });
  return NextResponse.json(outcome);
}
