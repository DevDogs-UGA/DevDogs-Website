/**
 * Does my app's moderation integration actually work?
 *
 * `conformance()` asks the database what it derived from your schema: is the
 * table addressable, can an author be attributed, does quarantine have a column
 * to write to, can a client still write that column. All of it is answerable
 * from the catalog, and `platform.conformance_check()` does the answering.
 *
 * The end-to-end round trip that used to live here (`quarantineRoundTrip`,
 * `moderation roundtrip`) is gone: the app repo's own CI covers that path —
 * file, quarantine, and check the freeze — more thoroughly than a devtools
 * command driven by hand ever did, and keeping two implementations of the
 * same assertion around was a drift risk with no offsetting benefit.
 *
 * Both `conformance()` and `catalog.ts`'s `readCatalog()` need to run as a
 * moderator, subject to the same RLS and `canModerate` checks a real one
 * would hit, rather than as `postgres` bypassing them. `withTemporaryModerator`
 * below is what supplies that account: a throwaway user, created through the
 * admin API and deleted again in a `finally`, rather than the seeded
 * `moderator@devdogs.test` persona this package used to sign in as — that
 * persona came from `supabase/seed/development/02_moderation.sql`, which only
 * ever ran on a local reset and is going away along with the rest of
 * `seed/development/` (see `persona.ts`'s header for the replacement).
 */
import {
  adminClient,
  signedInClient,
  type DevtoolsClient,
  type Instance,
} from "./instance.js";
import type { CheckResult } from "./ui.js";

interface ConformanceType {
  contentType: string;
  /** Schema-qualified, e.g. `platform.profile`. */
  tableName: string;
  checks: CheckResult[];
}

/** Runs `platform.conformance_check()` as the given moderator client. */
export async function conformance(
  client: DevtoolsClient,
  appSlug: string,
): Promise<ConformanceType[]> {
  const { data, error } = await client.rpc("conformance_check", {
    app_slug: appSlug,
  });
  if (error) throw new Error(error.message);

  return (data ?? []) as ConformanceType[];
}

/**
 * The role every devtools-granted moderator holds — `moderation check`'s
 * throwaway account and `persona moderator`'s longer-lived one alike, so
 * both resolve to the SAME role row rather than each accumulating their own.
 *
 * Reuses the id `supabase/seed/development/02_moderation.sql` used to seed
 * this same role under, on the theory that an existing local database that
 * still has that seeded row should be upserted into agreement rather than
 * given a second, redundant "Moderator" role.
 */
export const MODERATOR_ROLE_ID = "00000000-0000-4000-9000-000000000001";

/**
 * Creates (or updates) the Moderator role definition, and returns its id.
 *
 * `canModerate: true` and nothing else — not Root, not any of the other
 * `roles` permission columns — mirroring exactly what the seed persona held.
 * Idempotent (`upsert`) so repeated calls, from either caller above, never
 * race each other into two rows or fail on the second one.
 */
export async function ensureModeratorRole(
  admin: DevtoolsClient,
): Promise<string> {
  const { error } = await admin.from("roles").upsert({
    id: MODERATOR_ROLE_ID,
    title: "Moderator",
    description:
      "Created by `pnpm devtools`: works the report queue, and nothing else.",
    roleType: "custom",
    rank: 5000,
    canModerate: true,
  });
  if (error) {
    throw new Error(`Could not create the Moderator role: ${error.message}`);
  }
  return MODERATOR_ROLE_ID;
}

/** Grants the Moderator role to `userId`, creating the role definition first
 * if this is the first account to need it. */
export async function grantModerator(
  admin: DevtoolsClient,
  userId: string,
): Promise<void> {
  const roleId = await ensureModeratorRole(admin);
  const { error } = await admin.from("userRoles").insert({ userId, roleId });
  if (error) {
    throw new Error(`Could not grant the Moderator role: ${error.message}`);
  }
}

/** An email that unambiguously belongs to devtools, not a real account —
 * see `persona.ts`'s header for the `@persona.test` convention this shares. */
function temporaryModeratorEmail(): string {
  return `devtools-moderator-${crypto.randomUUID().slice(0, 8)}@persona.test`;
}

/** A password nobody needs to remember — this account lives for the
 * duration of one command. */
function randomPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

/**
 * Runs `fn` with a client signed in as a throwaway moderator, created for
 * this call and deleted again in a `finally` whether or not `fn` throws.
 *
 * The admin API's `createUser` bypasses the app's `before_user_created`
 * uga.edu hook (that hook only runs on the sign-up/OTP paths a real user
 * takes, not the service-role admin API), which is why a `@persona.test`
 * address works here at all — see `persona.ts`'s header for the same note
 * in more detail, since that is the command a contributor is more likely to
 * read first.
 */
export async function withTemporaryModerator<T>(
  instance: Instance,
  fn: (client: DevtoolsClient) => Promise<T>,
): Promise<T> {
  const admin = adminClient(instance);
  const email = temporaryModeratorEmail();
  const password = randomPassword();

  let userId: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { createdBy: "devtools moderation check" },
    });
    if (error || !data.user) {
      throw new Error(
        `Could not create a temporary moderator: ${error?.message}`,
      );
    }
    userId = data.user.id;

    await grantModerator(admin, userId);

    const client = await signedInClient(instance, email, password);
    return await fn(client);
  } finally {
    // `userRoles.userId` cascades on delete (see the migration that defines
    // it), so deleting the auth user is the whole teardown — no separate
    // `userRoles` row to clean up, and the Moderator role DEFINITION is left
    // in place for the next caller, same as `ensureModeratorRole` intends.
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}
