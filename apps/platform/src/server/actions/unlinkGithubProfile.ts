"use server";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { authenticate, expectUserWith } from "../auth";
import { unlinkProfile } from "../auth/providers/github";
import { db } from "../db";
import { oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";

export default async function unlinkGithubProfile() {
  const user = await expectUserWith({
    profile: {
      with: {
        // Development clients only: production clients are DevDogs apps'
        // sign-in credentials, owned by whichever officer created them and
        // not gated on GitHub. They are deleted through the audited,
        // replacement-checked path in oauth.ts, never as a side effect of
        // unlinking an account.
        oauthRegistrations: {
          columns: { clientId: true },
          where: { tier: "development" },
        },
      },
    },
  }).catch(() => authenticate("google", "/settings/accounts"));

  // A GitHub identity gates every DEVELOPMENT OAuth client a member holds
  // (see OAuthGateDialog), so unlinking takes all of those, not just one.
  const clientIds = user.profile.oauthRegistrations.map((r) => r.clientId);
  await unlinkProfile();

  if (clientIds.length > 0) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(oauthRegistrations)
          .where(
            and(
              eq(oauthRegistrations.userId, user.id),
              eq(oauthRegistrations.tier, "development"),
            ),
          );
        await Promise.all(
          clientIds.map((clientId) =>
            supabaseAdmin.auth.admin.oauth.deleteClient(clientId),
          ),
        );
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
