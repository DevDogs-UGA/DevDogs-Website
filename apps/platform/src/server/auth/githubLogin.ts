import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { identitiesInAuth } from "~/supabase/drizzle/schema";

/**
 * The GitHub login on a member's linked identity.
 *
 * Read from `auth.identities` rather than stored on the profile, so it cannot
 * go stale relative to what the user actually signed in with. Supabase's
 * GitHub provider puts the login in `identity_data.user_name`;
 * `preferred_username` and `login` are checked as fallbacks because the key
 * has changed across provider versions and a null here is indistinguishable
 * from "never linked".
 */
export async function githubLoginFor(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ data: identitiesInAuth.identityData })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.userId, userId),
        eq(identitiesInAuth.provider, "github"),
      ),
    );

  if (!row) return null;

  const data = row.data as Record<string, unknown>;
  for (const key of ["user_name", "preferred_username", "login"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
