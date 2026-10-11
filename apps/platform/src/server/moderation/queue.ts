import { env as workerEnv } from "cloudflare:workers";
import { stampQueued, staleDeliveryIds } from "./deliveryStore";

/**
 * The producer side of the delivery queue.
 *
 * A decision commits its deliveries as `pending` rows first; this puts their
 * ids on `MODERATION_DELIVERIES` afterwards. Putting them on the queue can fail
 * (no binding in a test or a bare `next dev`, a Queues outage) and nothing is
 * lost when it does: a row nobody queued has `queuedAt` null, which is what the
 * 15-minute cron re-queues.
 */

/** Cloudflare accepts at most 100 messages in one `sendBatch`. */
const BATCH = 100;

/**
 * How long a delivery may show no sign of life (queued, or attempted) before
 * the cron queues it again. It must outlast the longest retry backoff
 * (`MAX_RETRY_SECONDS`, an hour), or a delivery waiting out its backoff would be
 * queued a second time while the first copy is still retrying.
 */
export const REQUEUE_AFTER_MINUTES = 90;

export async function queueDeliveries(ids: readonly string[]): Promise<number> {
  const queue = workerEnv.MODERATION_DELIVERIES;
  if (!queue || ids.length === 0) return 0;

  let queued = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await queue.sendBatch(
      chunk.map((deliveryId) => ({ body: { deliveryId } })),
    );
    await stampQueued(chunk);
    queued += chunk.length;
  }
  return queued;
}

/** Best effort, for the request that just made the decision. Never throws. */
export async function queueDeliveriesQuietly(
  ids: readonly string[],
): Promise<void> {
  try {
    await queueDeliveries(ids);
  } catch (error) {
    console.error("moderation_queue_failed", {
      count: ids.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The cron's pass: queue whatever the queue never saw, or lost track of. */
export async function requeueStaleDeliveries(limit = 200): Promise<number> {
  return queueDeliveries(await staleDeliveryIds(REQUEUE_AFTER_MINUTES, limit));
}
