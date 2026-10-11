"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { expectSession } from "~/server/auth";
import {
  canUserManageSuspensions,
  canUserModerate,
} from "~/server/actions/permissions";
import { parseContentTypes } from "~/server/moderation/contentTypes";
import { endpointUrlProblem } from "~/server/moderation/endpoint";
import { resetForResend } from "~/server/moderation/deliveryStore";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";

/**
 * Puts an undelivered decision back on the queue.
 *
 * Only a `failed` or `pending` delivery resets: a delivered one is already in
 * the app's `moderation_events`, which ignores a replay of the same message id,
 * so resending it would change nothing but the status the console shows.
 */
export async function resendDelivery(deliveryId: string): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserModerate(userId))) {
    throw new Error("Not authorized to resend moderation deliveries");
  }
  if (await resetForResend(deliveryId)) {
    await queueDeliveriesQuietly([deliveryId]);
  }
  revalidatePath("/console/moderation", "layout");
}

export interface RegisterAppState {
  ok: boolean;
  message: string | null;
}

const SLUG = /^[a-z][a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registers an OAuth client as a production moderation app: its reports reach
 * moderators from now on, and decisions are delivered to `endpointUrl`.
 *
 * `canManageSuspensions` is the closest standing permission to "an officer who
 * administers other apps' accounts"; swap in `canManageOAuthApps` when that
 * permission exists (lane 3c).
 */
export async function registerExternalApp(
  _previous: RegisterAppState,
  formData: FormData,
): Promise<RegisterAppState> {
  const userId = await expectSession();
  if (!(await canUserManageSuspensions(userId))) {
    return { ok: false, message: "You cannot register apps" };
  }

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const slug = text("slug");
  const displayName = text("displayName");
  const clientId = text("clientId");
  const endpointUrl = text("endpointUrl");

  if (!SLUG.test(slug)) {
    return {
      ok: false,
      message: "The slug is lowercase letters, digits and hyphens",
    };
  }
  if (!displayName) return { ok: false, message: "A name is required" };
  if (!UUID.test(clientId)) {
    return { ok: false, message: "The client id is a UUID" };
  }
  const problem = endpointUrlProblem(endpointUrl);
  if (problem) return { ok: false, message: problem };
  const parsed = parseContentTypes(text("contentTypes"));
  if (!parsed.ok) return { ok: false, message: parsed.message };

  try {
    await db.execute(
      sql`select "platform".register_external_app(
            ${slug}, ${displayName}, ${clientId.toLowerCase()}::uuid,
            ${endpointUrl}, ${JSON.stringify(parsed.types)}::jsonb
          )`,
    );
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : "";
    if (/moderationClients_clientId_fkey|violates foreign key/.test(cause)) {
      return { ok: false, message: "No OAuth client has that id" };
    }
    if (cause.includes("is a platform app")) {
      return { ok: false, message: "That slug belongs to a platform app" };
    }
    throw error;
  }

  revalidatePath("/console/moderation", "layout");
  return { ok: true, message: `${displayName} is registered` };
}
