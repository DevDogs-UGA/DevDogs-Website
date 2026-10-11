"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import {
  MESSAGE_TYPES,
  buildMessage,
  type MessageType,
} from "@devdogsuga/sdk/moderation";
import { env } from "~/env";
import { db } from "~/server/db";
import { moderationClients, moderationDeliveries } from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import { attemptDelivery } from "~/server/moderation/delivery";
import { databaseDeliveryStore } from "~/server/moderation/deliveryStore";
import { endpointUrlProblem } from "~/server/moderation/endpoint";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";
import { deriveClientSecret } from "~/server/moderation/secrets";
import { consumeRateLimit } from "~/server/rateLimit";

export type OAuthModerationState = {
  clientId: string | null;
  /** Shown once: only a version number is stored, but the page never re-derives it. */
  secret: string | null;
  message: string | null;
  ok: boolean;
};

const EMPTY: OAuthModerationState = {
  clientId: null,
  secret: null,
  message: null,
  ok: true,
};

const fail = (message: string): OAuthModerationState => ({
  ...EMPTY,
  ok: false,
  message,
});

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** The registration row, if `userId` owns the client. */
async function ownedClient(clientId: string, userId: string) {
  return db.query.oauthRegistrations.findFirst({
    columns: { clientId: true },
    where: { clientId, userId },
  });
}

/**
 * The per-client moderation controls on `/tools/oauth`.
 *
 * Every intent starts from ownership: the client must be one of the signed-in
 * member's own. A client an officer has registered as a production app
 * (`moderationClients."appId"` set) keeps its secret controls, but cannot send
 * test actions: those would hit the live receiver.
 */
export default async function oauthModerationAction(
  _previous: OAuthModerationState,
  formData: FormData,
): Promise<OAuthModerationState> {
  const userId = await expectSession();
  const intent = field(formData, "intent");
  const clientId = field(formData, "clientId");

  if (!(await ownedClient(clientId, userId))) {
    return fail("OAuth client not found");
  }
  if (!env.MODERATION_SIGNING_KEY) {
    return fail("Moderation is not configured on this deployment yet");
  }
  const signingKey = env.MODERATION_SIGNING_KEY;

  const [existing] = await db
    .select()
    .from(moderationClients)
    .where(eq(moderationClients.clientId, clientId));

  switch (intent) {
    case "enable": {
      const endpointUrl = field(formData, "endpointUrl");
      const problem = endpointUrl ? endpointUrlProblem(endpointUrl) : null;
      if (problem) return fail(problem);

      // The secret is shown once, when moderation is first turned on. A second
      // "enable" must not show it again: the owner rotates to get a new one.
      if (existing) {
        return fail(
          "Moderation is already on for this client. Rotate the secret to get a new one",
        );
      }
      await db
        .insert(moderationClients)
        .values({ clientId, endpointUrl: endpointUrl || null })
        .onConflictDoNothing();
      revalidatePath("/tools/oauth");
      return {
        ...EMPTY,
        clientId,
        secret: await deriveClientSecret(signingKey, clientId, 1),
        message: "Moderation is on. Copy the secret now: it is shown once.",
      };
    }

    case "set-endpoint": {
      if (!existing) return fail("Turn moderation on first");
      const endpointUrl = field(formData, "endpointUrl");
      const problem = endpointUrl ? endpointUrlProblem(endpointUrl) : null;
      if (problem) return fail(problem);
      await db
        .update(moderationClients)
        .set({ endpointUrl: endpointUrl || null, updatedAt: sql`now()` })
        .where(eq(moderationClients.clientId, clientId));
      revalidatePath("/tools/oauth");
      return { ...EMPTY, message: "Endpoint saved" };
    }

    case "rotate-secret": {
      if (!existing) return fail("Turn moderation on first");
      const [row] = await db
        .update(moderationClients)
        .set({
          secretVersion: sql`${moderationClients.secretVersion} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(moderationClients.clientId, clientId))
        .returning({ secretVersion: moderationClients.secretVersion });
      revalidatePath("/tools/oauth");
      return {
        ...EMPTY,
        clientId,
        secret: await deriveClientSecret(
          signingKey,
          clientId,
          row?.secretVersion ?? 1,
        ),
        message:
          "The secret was rotated. The old one stops working now; copy the new one: it is shown once.",
      };
    }

    case "send-test": {
      if (!existing) return fail("Turn moderation on first");
      if (existing.appId) {
        return fail(
          "This client is a registered production app. Test actions only go to development clients",
        );
      }
      if (!existing.endpointUrl) return fail("Set an endpoint URL first");

      const type = field(formData, "type");
      if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
        return fail("Choose an action");
      }
      const allowed = await consumeRateLimit({
        scope: "moderation:test-action",
        subjectId: userId,
        limit: 30,
        windowSeconds: 3600,
      });
      if (!allowed) return fail("Too many test actions. Try again later");

      const message = buildMessage({
        type: type as MessageType,
        contentType: field(formData, "contentType") || undefined,
        contentRef: field(formData, "contentRef") || undefined,
        // A user action about the owner themselves, so it maps to an account
        // they control in the app.
        userId,
      });
      const [row] = await db
        .insert(moderationDeliveries)
        .values({
          clientId,
          type: message.type,
          payload: message,
          sandbox: true,
        })
        .returning({ id: moderationDeliveries.id });
      if (!row) throw new Error("The test delivery was not recorded");

      // One attempt now, so the owner sees the receiver's answer instead of a
      // promise; if it did not land, the queue keeps trying.
      const outcome = await attemptDelivery(row.id, {
        store: databaseDeliveryStore,
        signingKey,
      });
      revalidatePath("/tools/oauth");
      if (outcome.ack && outcome.result === "delivered") {
        return {
          ...EMPTY,
          message: `Delivered ${message.type} to your endpoint`,
        };
      }
      if (outcome.ack) {
        return fail("The delivery could not be sent. Check the endpoint URL");
      }
      await queueDeliveriesQuietly([row.id]);
      return fail(
        `Your endpoint did not accept it (${outcome.error}). It will be retried`,
      );
    }

    default:
      return fail("Unknown action");
  }
}
