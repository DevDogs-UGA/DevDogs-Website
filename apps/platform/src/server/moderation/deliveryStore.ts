import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { moderationDeliveries } from "~/server/db/schema";
import type { DeliveryStore, DeliveryTarget } from "./delivery";

type Row = {
  id: string;
  status: DeliveryTarget["status"];
  attempts: number;
  payload: unknown;
  clientId: string | null;
  endpointUrl: string | null;
  secretVersion: number | null;
};

/**
 * Where a delivery goes is read at SEND time, not frozen with the message. A
 * production app's client can be replaced (re-registering the app moves it), and
 * a message that was owed before the swap belongs to the app, so the app's
 * current client wins. A sandbox delivery has no app and uses its own client.
 */
export const databaseDeliveryStore: DeliveryStore = {
  async load(id) {
    const rows = await db.execute<Row>(sql`
      select d."id", d."status", d."attempts", d."payload",
             coalesce(by_app."clientId", by_client."clientId") as "clientId",
             coalesce(by_app."endpointUrl", by_client."endpointUrl") as "endpointUrl",
             coalesce(by_app."secretVersion", by_client."secretVersion") as "secretVersion"
      from "platform"."moderationDeliveries" d
      left join "platform"."moderationClients" by_app
        on d."appId" is not null and by_app."appId" = d."appId"
      left join "platform"."moderationClients" by_client
        on by_client."clientId" = d."clientId"
      where d."id" = ${id}::uuid
    `);
    const row = rows[0];
    return row ?? null;
  },

  async markDelivered(id) {
    await db
      .update(moderationDeliveries)
      .set({
        status: "delivered",
        attempts: sql`${moderationDeliveries.attempts} + 1`,
        lastAttemptAt: sql`now()`,
        deliveredAt: sql`now()`,
        lastError: null,
      })
      .where(eq(moderationDeliveries.id, id));
  },

  async markAttemptFailed(id, error) {
    await db
      .update(moderationDeliveries)
      .set({
        attempts: sql`${moderationDeliveries.attempts} + 1`,
        lastAttemptAt: sql`now()`,
        lastError: error.slice(0, 500),
      })
      .where(eq(moderationDeliveries.id, id));
  },

  async markFailed(id, error) {
    await db
      .update(moderationDeliveries)
      .set({
        status: "failed",
        lastAttemptAt: sql`now()`,
        lastError: error.slice(0, 500),
      })
      .where(
        and(
          eq(moderationDeliveries.id, id),
          eq(moderationDeliveries.status, "pending"),
        ),
      );
  },
};

/**
 * Pending deliveries that never reached the queue, or that the queue has gone
 * quiet about. "Quiet" is measured from the latest sign of life, the queue stamp
 * or the last attempt: a delivery in its retry backoff attempts again within
 * `retryDelaySeconds` (at most an hour), so it is not stale, only a message that
 * was lost is silent for longer than that.
 */
export async function staleDeliveryIds(
  olderThanMinutes: number,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: moderationDeliveries.id })
    .from(moderationDeliveries)
    .where(
      and(
        eq(moderationDeliveries.status, "pending"),
        or(
          isNull(moderationDeliveries.queuedAt),
          lt(
            sql`greatest(${moderationDeliveries.queuedAt}, ${moderationDeliveries.lastAttemptAt})`,
            sql`now() - make_interval(mins => ${olderThanMinutes})`,
          ),
        ),
      ),
    )
    .orderBy(moderationDeliveries.createdAt)
    .limit(limit);
  return rows.map((row) => row.id);
}

export async function stampQueued(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(moderationDeliveries)
    .set({ queuedAt: sql`now()` })
    .where(inArray(moderationDeliveries.id, ids));
}

/**
 * A moderator's (or owner's) resend. Only an undelivered message can be resent:
 * a delivered one already sits in the receiver's `moderation_events`, which
 * would ignore the replay anyway. Returns whether anything was reset.
 */
export async function resetForResend(id: string): Promise<boolean> {
  const rows = await db
    .update(moderationDeliveries)
    .set({ status: "pending", lastError: null, queuedAt: null })
    .where(
      and(
        eq(moderationDeliveries.id, id),
        inArray(moderationDeliveries.status, ["failed", "pending"]),
      ),
    )
    .returning({ id: moderationDeliveries.id });
  return rows.length > 0;
}
