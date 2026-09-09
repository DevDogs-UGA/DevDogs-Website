"use server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { authenticate, expectUserWith } from "../auth";
import { unlinkProfile } from "../auth/providers/github";
import { db } from "../db";
import { oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";

export default async function unlinkGithubProfile() {
  const user = await expectUserWith({
    profile: { with: { oauthRegistration: true } },
  }).catch(() => authenticate("google", "/account"));

  const clientId = user.profile.oauthRegistration?.clientId;
  await unlinkProfile();

  if (clientId) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(oauthRegistrations)
          .where(eq(oauthRegistrations.userId, user.id));
        await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
      });
    } catch (cause) {
      console.error(
        JSON.stringify({
          message: "Connected-account side effect failed",
          provider: "github",
          operation: "delete_oauth_client",
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }
  }

  refresh();
}
