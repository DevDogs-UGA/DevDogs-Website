/**
 * The Worker's Queues consumer, composed into the entry by ./worker.ts next to
 * `fetch` and `scheduled`.
 *
 * Two queues feed it, told apart by name:
 *
 * - `<tier>-moderation-deliveries`: each message is the id of a signed
 *   delivery owed to an app. The consumer asks the Worker's own
 *   `/cron/moderation-deliveries/deliver` route to attempt it (so the attempt
 *   runs with the platform's database client and error reporting, the same way
 *   the cron dispatcher reaches its routes) and acks or retries the message from
 *   the answer.
 * - `<tier>-moderation-deliveries-dlq`: the dead-letter queue, for a message
 *   that used up its retries. Each one goes to `/dead-letter`, which marks the
 *   delivery failed and calls `postAlert`.
 *
 * Any trouble reaching the route retries the message, never drops it: a
 * delivery is a decision a moderator made, and the row stays pending until it
 * lands or a person resolves it. `retry` past `max_retries` is what moves a
 * message to the DLQ.
 */
import type { env } from "~/env";
import {
  isDeliveryMessage,
  retryDelaySeconds,
} from "~/server/moderation/queueMessage";

export type QueueEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL">;

export const DEAD_LETTER_SUFFIX = "-dlq";

interface QueueMessage {
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export async function handleQueue(
  batch: { readonly queue: string; readonly messages: readonly QueueMessage[] },
  workerEnv: QueueEnv,
): Promise<void> {
  const deadLetter = batch.queue.endsWith(DEAD_LETTER_SUFFIX);
  const path = deadLetter
    ? "/cron/moderation-deliveries/dead-letter"
    : "/cron/moderation-deliveries/deliver";

  for (const message of batch.messages) {
    if (!isDeliveryMessage(message.body)) {
      // Not something this code ever sends. Retrying cannot fix it.
      console.error("moderation_queue_poison_message", { queue: batch.queue });
      message.ack();
      continue;
    }

    try {
      const response = await fetch(`${workerEnv.BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerEnv.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deliveryId: message.body.deliveryId }),
      });
      if (!response.ok) {
        message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
        continue;
      }
      const result = (await response.json().catch(() => null)) as {
        ack?: boolean;
        retryAfterSeconds?: number;
      } | null;
      if (!deadLetter && result?.ack === false) {
        message.retry({
          delaySeconds:
            result.retryAfterSeconds ?? retryDelaySeconds(message.attempts),
        });
      } else {
        message.ack();
      }
    } catch {
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
    }
  }
}
