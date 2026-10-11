import { db } from "~/server/db";
import { auditEvents, oauthRegistrations } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { oauthAuditEvent } from "./audit";
import { productionRedirectUriError, type OAuthTier } from "./tier";

export interface CreatedOauthClient {
  clientId: string;
  clientSecret: string;
}

/**
 * Deletes a Supabase OAuth client that never got its registration row, so a
 * failed registration cannot leave a live client nobody is accountable for.
 * Best effort: if this fails too there is nothing more to do here than say so
 * loudly, and the original error is still the one the caller sees.
 */
async function discardUnregisteredClient(clientId: string): Promise<void> {
  try {
    const { error } =
      await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
    if (error) throw error;
  } catch (cause) {
    console.error({
      message: "Could not delete an OAuth client whose registration failed",
      clientId,
      cause,
    });
  }
}

/**
 * Creates a fresh Supabase OAuth client for `label`/`redirectUris` and inserts
 * the matching `oauthRegistrations` row so it shows up under `/tools/oauth`.
 * Shared by `devtools oauth`'s two handoffs (the loopback one-click connect,
 * `~/server/actions/oauthConnect.ts`, and the device-code flow,
 * `~/server/actions/oauthDevice.ts`) and by the manual form
 * (`~/server/actions/oauth.ts`), so "what a freshly created client looks like"
 * is defined in exactly one place.
 *
 * The client is created first because its id is the registration's key. If the
 * registration (or, for a production client, its audit entry, which commits in
 * the same transaction) fails, the client is deleted again and the error is
 * rethrown: there is never a client without a registration.
 *
 * A `production` client may only be created by a caller who already holds
 * `canManageOAuthApps`; this function does not check that, the action does.
 * What it does enforce is the return address, because a production client is
 * approved without anyone looking at it.
 */
export async function createOauthClientAndRegister(options: {
  label: string;
  redirectUris: string[];
  userId: string;
  tier?: OAuthTier;
}): Promise<CreatedOauthClient> {
  const { label, redirectUris, userId, tier = "development" } = options;

  if (tier === "production") {
    for (const uri of redirectUris) {
      const problem = productionRedirectUriError(uri);
      if (problem) throw new Error(problem);
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
    client_name: label,
    redirect_uris: redirectUris,
    scope: "openid email profile",
  });
  if (error ?? !data?.client_secret) {
    throw new Error("Failed to create OAuth client");
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(oauthRegistrations)
        .values({ userId, clientId: data.client_id, label, tier });
      if (tier === "production") {
        await tx.insert(auditEvents).values(
          oauthAuditEvent({
            actorUserId: userId,
            action: "oauth_client.created",
            clientId: data.client_id,
            metadata: { label, redirectUris: redirectUris.join(",") },
          }),
        );
      }
    });
  } catch (cause) {
    await discardUnregisteredClient(data.client_id);
    throw cause;
  }

  return { clientId: data.client_id, clientSecret: data.client_secret };
}
