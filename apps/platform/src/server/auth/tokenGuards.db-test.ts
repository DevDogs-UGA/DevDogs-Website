// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { recordLinkIntent } from "./linkIntent";

/**
 * What a token issued to an OAuth client cannot do through GoTrue (migration
 * 61): set a password, or attach an identity the platform did not start
 * linking. The statements are the ones GoTrue runs for `PUT /auth/v1/user` and
 * for the callback of a link; `scripts/verify-oauth-tiers.ts` makes the real
 * requests with a client's tokens against a running project.
 */

const MEMBER = "f8000000-0000-4000-a000-000000000001";
const OTHER = "f8000000-0000-4000-a000-000000000002";
const EMAIL = "token-guards-member@uga.edu";

/** Drizzle wraps the driver error; the SQL message is on `cause`. */
async function rejectsWith(query: ReturnType<typeof sql>, pattern: RegExp) {
  const error = (await db.execute(query).then(
    () => null,
    (e: unknown) => e,
  )) as { message: string; cause?: { message: string } } | null;
  expect(error, "the statement should have been rejected").not.toBeNull();
  expect(error?.cause?.message ?? error?.message).toMatch(pattern);
}

function addIdentity(
  userId: string,
  provider: string,
  data: Record<string, unknown>,
) {
  return db.execute(sql`
    insert into auth.identities (id, provider_id, user_id, identity_data, provider)
    values (gen_random_uuid(), ${`${provider}-${userId}`}, ${userId}::uuid,
            ${JSON.stringify(data)}::jsonb, ${provider})
  `);
}

async function identities(userId: string) {
  const rows = await db.execute<{ provider: string }>(
    sql`select provider from auth.identities
        where user_id = ${userId}::uuid order by provider`,
  );
  return rows.map((row) => row.provider);
}

async function cleanup() {
  for (const id of [MEMBER, OTHER]) {
    await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
}

beforeAll(async () => {
  await cleanup();
  for (const [id, email] of [
    [MEMBER, EMAIL],
    [OTHER, "token-guards-other@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
});

afterAll(cleanup);

describe("passwords", () => {
  it("refuses to set one on an account that has none", async () => {
    await rejectsWith(
      sql`update auth.users set encrypted_password = 'hash'
          where id = ${MEMBER}::uuid`,
      /passwords cannot be set/,
    );
  });

  it("lets a statement that names the column without changing it through", async () => {
    // GoTrue rewrites the whole row on most updates.
    await db.execute(
      sql`update auth.users set encrypted_password = encrypted_password,
                 last_sign_in_at = now()
          where id = ${MEMBER}::uuid`,
    );
  });

  it("lets a password be cleared", async () => {
    await db.execute(
      sql`update auth.users set encrypted_password = null
          where id = ${MEMBER}::uuid`,
    );
  });
});

describe("linking an identity", () => {
  it("allows an account's first identity", async () => {
    await addIdentity(MEMBER, "google", { email: EMAIL, email_verified: true });
    expect(await identities(MEMBER)).toEqual(["google"]);
  });

  it("refuses another identity nobody started linking", async () => {
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'attacker', ${MEMBER}::uuid,
                  '{"email":"attacker@example.com"}'::jsonb, 'github')`,
      /linked from your DevDogs account page/,
    );
    expect(await identities(MEMBER)).toEqual(["google"]);
  });

  it("allows automatic linking, when the provider vouches for the account's own address", async () => {
    await addIdentity(MEMBER, "discord", {
      email: EMAIL.toUpperCase(),
      email_verified: true,
    });
    expect(await identities(MEMBER)).toEqual(["discord", "google"]);
  });

  it("refuses an identity whose address matches but is not verified", async () => {
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'unverified', ${MEMBER}::uuid,
                  ${JSON.stringify({ email: EMAIL, email_verified: false })}::jsonb,
                  'linkedin_oidc')`,
      /linked from your DevDogs account page/,
    );
  });

  it("allows one link the platform started, once", async () => {
    await recordLinkIntent(MEMBER, "github");
    await addIdentity(MEMBER, "github", { email: "member@example.com" });
    expect(await identities(MEMBER)).toEqual(["discord", "github", "google"]);

    await db.execute(
      sql`delete from auth.identities
          where user_id = ${MEMBER}::uuid and provider = 'github'`,
    );
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'again', ${MEMBER}::uuid,
                  '{"email":"member@example.com"}'::jsonb, 'github')`,
      /linked from your DevDogs account page/,
    );
  });

  it("does not let an intent for one provider, one account or one moment serve another", async () => {
    await addIdentity(OTHER, "google", { email: "x@uga.edu" });

    await recordLinkIntent(MEMBER, "linkedin_oidc");
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'wrong-provider', ${MEMBER}::uuid,
                  '{"email":"m@example.com"}'::jsonb, 'github')`,
      /linked from your DevDogs account page/,
    );
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'wrong-account', ${OTHER}::uuid,
                  '{"email":"m@example.com"}'::jsonb, 'linkedin_oidc')`,
      /linked from your DevDogs account page/,
    );

    await db.execute(sql`
      update platform."identityLinkIntents"
         set "expiresAt" = now() - interval '1 minute'
       where "userId" = ${MEMBER}::uuid and provider = 'linkedin_oidc'
    `);
    await rejectsWith(
      sql`insert into auth.identities (id, provider_id, user_id, identity_data, provider)
          values (gen_random_uuid(), 'expired', ${MEMBER}::uuid,
                  '{"email":"m@example.com"}'::jsonb, 'linkedin_oidc')`,
      /linked from your DevDogs account page/,
    );
  });

  it("is closed to the API roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const rows = await db.execute<{ allowed: boolean }>(sql`
        select has_table_privilege(
                 ${role}, 'platform."identityLinkIntents"',
                 'select, insert, update, delete') as allowed
      `);
      expect(rows[0]?.allowed, `${role} should have no access`).toBe(false);
    }
  });
});
