import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
  auditEvents,
  oauthRegistrations,
  oauthTestAccounts,
} from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { oauthAuditEvent } from "./audit";

/**
 * The pieces of removing OAuth clients that the settings action
 * (`~/server/actions/oauth.ts`) and the account-deletion job share. They live
 * here, not in the action file, because a `"use server"` module turns every
 * export into a callable endpoint and none of these checks who is asking.
 */

/** Deletes a Supabase OAuth client; one that is already gone counts as deleted. */
export async function deleteSupabaseClient(clientId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
  if (error && error.status !== 404) {
    throw new Error(`Failed to delete OAuth client: ${error.message}`);
  }
}

/**
 * Deletes every test account this user owns and their backing `auth.users`
 * rows, once they hold zero OAuth clients (test accounts exist only to sign
 * into somebody's client).
 */
export async function cleanUpTestAccountsIfNoClientsRemain(
  userId: string,
): Promise<void> {
  const remaining = await db.query.oauthRegistrations.findFirst({
    columns: { clientId: true },
    where: { userId },
  });
  if (remaining) return;

  const testAccounts = await db.query.oauthTestAccounts.findMany({
    columns: { testUserId: true },
    where: { ownerUserId: userId },
  });
  if (testAccounts.length === 0) return;

  await db
    .delete(oauthTestAccounts)
    .where(eq(oauthTestAccounts.ownerUserId, userId));
  await Promise.all(
    testAccounts.map(({ testUserId }) =>
      supabaseAdmin.auth.admin.deleteUser(testUserId),
    ),
  );
}

/**
 * Removes the OAuth apps a member owns because their account is being
 * deleted (account-deletion Q11, oauth-consent Q160).
 *
 * A development client is the member's own: its Supabase client is deleted,
 * then its registration, then the test accounts that only existed to sign into
 * it. A production client still owned by a member is a DevDogs app that was
 * never transferred; deleting it would end sign-in, so it is released instead
 * (owner cleared, which is what Transfer to DevDogs does) and an audit entry
 * says so. Clients with no owner are never touched. Every step is safe to
 * repeat.
 */
export async function removeMemberOAuthApps(
  userId: string,
): Promise<{ deleted: number; released: number }> {
  const owned = await db
    .select({
      clientId: oauthRegistrations.clientId,
      tier: oauthRegistrations.tier,
      label: oauthRegistrations.label,
    })
    .from(oauthRegistrations)
    .where(eq(oauthRegistrations.userId, userId));

  let deleted = 0;
  let released = 0;
  for (const client of owned) {
    if (client.tier === "production") {
      await db.transaction(async (tx) => {
        await tx.insert(auditEvents).values(
          oauthAuditEvent({
            actorUserId: userId,
            action: "oauth_client.owner_cleared",
            clientId: client.clientId,
            metadata: { label: client.label, reason: "account_deleted" },
          }),
        );
        await tx
          .update(oauthRegistrations)
          .set({ userId: null })
          .where(
            and(
              eq(oauthRegistrations.clientId, client.clientId),
              eq(oauthRegistrations.userId, userId),
            ),
          );
      });
      released++;
      continue;
    }
    // Supabase first: the registration's foreign key does not cascade, since
    // GoTrue only soft-deletes. A failure here leaves the registration, so the
    // next run finds the client again.
    await deleteSupabaseClient(client.clientId);
    await db
      .delete(oauthRegistrations)
      .where(
        and(
          eq(oauthRegistrations.clientId, client.clientId),
          eq(oauthRegistrations.userId, userId),
        ),
      );
    deleted++;
  }

  await cleanUpTestAccountsIfNoClientsRemain(userId);
  return { deleted, released };
}
