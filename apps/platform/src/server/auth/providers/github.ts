import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import z from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
import { leaderboardProfiles } from "~/server/db/schema";
import { createSupabaseServerClient } from "~/supabase/server";

const CALLBACK_URL = new URL("/auth/callback", env.BASE_URL).toString();

export async function requestAuthorization(
  callbackPath: string,
): Promise<never> {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient();

  // Store the post-auth destination in a short-lived cookie so the callback
  // handler can redirect there after the Supabase round-trip.
  cookieStore.set("auth_callback_path", callbackPath, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("auth_intent", "link:github", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
      scopes: "user:email",
      queryParams: {
        access_type: "offline",
      },
    },
  });

  if (error ?? !data.url) {
    console.error({ data, error });
    throw new Error("Failed to initiate GitHub OAuth via Supabase");
  }

  redirect(data.url);
}

const profileSchema = z.object({
  id: z.int(),
  login: z.string(),
  avatar_url: z.string(),
});

/**
 * Fetches the GitHub profile and upserts it into `leaderboardProfiles`.
 * Supabase owns the identity link itself, in `auth.identities`.
 *
 * Linking no longer invites anyone to the DevDogs GitHub organization. Members
 * contribute from forks; the organization is for officers, leads and
 * reviewers, whom an owner adds by hand.
 * @param accessToken The GitHub access token from the Supabase OAuth session.
 * @see `requestAuthorization`
 */
export async function linkProfile(accessToken: string): Promise<void> {
  const profile = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "Bearer " + accessToken,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
    .then(async (res) => {
      if (!res.ok) throw githubApiError("read_profile", res);
      const body: unknown = await res.json();
      return body;
    })
    .then((obj) => profileSchema.parseAsync(obj));

  // Records the GitHub identity against the member, and nothing more.
  await db
    .insert(leaderboardProfiles)
    .values({
      githubId: String(profile.id),
      githubLogin: profile.login,
      avatarUrl: profile.avatar_url,
    })
    .onConflictDoUpdate({
      target: leaderboardProfiles.githubId,
      set: {
        githubLogin: sql`excluded."githubLogin"`,
        avatarUrl: sql`excluded."avatarUrl"`,
      },
    });
}

/**
 * Unlinks a member's GitHub identity from Supabase. The `leaderboardProfiles`
 * row survives, since it is the GitHub-account-to-member mapping. Nothing is
 * changed on GitHub: the platform no longer manages organization membership.
 */
export async function unlinkProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error: identitiesError } =
    await supabase.auth.getUserIdentities();
  if (identitiesError) {
    throw new Error(
      `Failed to read GitHub identity: ${identitiesError.message}`,
    );
  }
  const identity = data?.identities.find((i) => i.provider === "github");

  if (!identity) return;

  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) {
    throw new Error(`Failed to unlink GitHub identity: ${error.message}`);
  }
}

function githubApiError(operation: string, response: Response): Error {
  console.error(
    JSON.stringify({
      message: "Connected-account side effect failed",
      provider: "github",
      operation,
      status: response.status,
      requestId: response.headers.get("x-github-request-id"),
    }),
  );
  return new Error(`GitHub ${operation} failed (${response.status})`);
}
