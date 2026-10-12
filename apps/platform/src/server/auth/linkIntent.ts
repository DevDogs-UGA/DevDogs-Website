import { db } from "~/server/db";
import { identityLinkIntents } from "~/server/db/schema";

/**
 * How long the member has to finish the provider's consent screen. The
 * `auth_callback_path` and `auth_intent` cookies that carry them through the
 * round trip last ten minutes; this outlives them by a little and no more.
 */
const LINK_INTENT_MINUTES = 15;

/**
 * Records that this member, signed in on this site, is about to link `provider`
 * to their account.
 *
 * GoTrue lets any bearer it signed start a link (`enable_manual_linking`), and
 * an OAuth client holds two of those. The database refuses to add a second
 * identity unless one of these rows is waiting for it (migration 61,
 * `platform.guard_identity_link`), and only a first-party session reaches this
 * function. The row is consumed by the insert it allows, so it buys one link.
 */
export async function recordLinkIntent(
  userId: string,
  provider: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + LINK_INTENT_MINUTES * 60_000);
  await db
    .insert(identityLinkIntents)
    .values({ userId, provider, expiresAt })
    .onConflictDoUpdate({
      target: [identityLinkIntents.userId, identityLinkIntents.provider],
      set: { expiresAt },
    });
}
