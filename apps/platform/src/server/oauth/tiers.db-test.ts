// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { auditEvents } from "~/server/db/schema";
import { oauthAuditEvent } from "./audit";
import { findConsentTarget } from "./consentTarget";

/**
 * The tier column, the `canManageOAuthApps` permission, the audit entry shape
 * and the consent lookup, against a real database (migration 57).
 */

const IDS = {
  owner: "f6000000-0000-4000-a000-000000000001",
  holder: "f6000000-0000-4000-a000-000000000002",
  bystander: "f6000000-0000-4000-a000-000000000003",
  devClient: "f6000000-0000-4000-b000-000000000001",
  productionClient: "f6000000-0000-4000-b000-000000000002",
  role: "f6000000-0000-4000-d000-000000000001",
  devAuthorization: "f6000000-0000-4000-e000-000000000001",
  productionAuthorization: "f6000000-0000-4000-e000-000000000002",
};

const USERS = [
  [IDS.owner, "tiers-owner@uga.edu"],
  [IDS.holder, "tiers-holder@uga.edu"],
  [IDS.bystander, "tiers-bystander@uga.edu"],
] as const;

const CLIENTS = [IDS.devClient, IDS.productionClient];
const callback = "https://dogdays.supabase.co/auth/v1/callback";

const PRESIDENT = "00000000-0000-0000-0000-000000000002";
const DEVOPS_DIRECTOR = "00000000-0000-4000-8000-000000000003";
const VICE_PRESIDENT = "00000000-0000-4000-8000-000000000002";

/** Drizzle wraps the driver error; the SQL message is on `cause`. */
async function rejectsWith(query: ReturnType<typeof sql>, pattern: RegExp) {
  const error = (await db.execute(query).then(
    () => null,
    (e: unknown) => e,
  )) as { message: string; cause?: { message: string } } | null;
  expect(error, "the statement should have been rejected").not.toBeNull();
  expect(error?.cause?.message ?? error?.message).toMatch(pattern);
}

async function cleanup() {
  await db.execute(
    sql`delete from auth.oauth_authorizations where authorization_id like 'tiers-db-test-%'`,
  );
  await db.execute(
    sql`delete from platform."userRoles" where "roleId" = ${IDS.role}::uuid`,
  );
  await db.execute(
    sql`delete from platform.roles where id = ${IDS.role}::uuid`,
  );
  for (const id of CLIENTS) {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${id}::uuid`,
    );
    await db.execute(
      sql`delete from auth.oauth_clients where id = ${id}::uuid`,
    );
  }
  for (const [id] of USERS) {
    await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
  for (const id of CLIENTS) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method,
        created_at, updated_at
      )
      values (
        ${id}::uuid, '', 'manual', ${callback},
        'authorization_code,refresh_token', 'tiers test',
        'public', 'none', now(), now()
      )
    `);
  }
});

afterAll(cleanup);

describe("oauthRegistrations.tier", () => {
  it("defaults to development and can be set to production at creation", async () => {
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (${IDS.devClient}::uuid, ${IDS.owner}::uuid)
    `);
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId", "tier")
      values (${IDS.productionClient}::uuid, ${IDS.owner}::uuid, 'production')
    `);

    const rows = await db.execute<{ clientId: string; tier: string }>(sql`
      select "clientId", tier::text as tier from platform."oauthRegistrations"
      where "clientId" in (${IDS.devClient}::uuid, ${IDS.productionClient}::uuid)
    `);
    const tiers = Object.fromEntries(rows.map((r) => [r.clientId, r.tier]));
    expect(tiers).toEqual({
      [IDS.devClient]: "development",
      [IDS.productionClient]: "production",
    });
  });

  it("refuses to change after creation, in either direction", async () => {
    await rejectsWith(
      sql`update platform."oauthRegistrations" set tier = 'production'
          where "clientId" = ${IDS.devClient}::uuid`,
      /tier cannot change/,
    );
    await rejectsWith(
      sql`update platform."oauthRegistrations" set tier = 'development'
          where "clientId" = ${IDS.productionClient}::uuid`,
      /tier cannot change/,
    );
  });

  it("still allows an update that leaves the tier as it was", async () => {
    await db.execute(sql`
      update platform."oauthRegistrations"
         set tier = 'production', label = 'Renamed'
       where "clientId" = ${IDS.productionClient}::uuid
    `);
    await db.execute(sql`
      update platform."oauthRegistrations" set label = 'Default Client'
       where "clientId" = ${IDS.productionClient}::uuid
    `);
  });
});

describe("canManageOAuthApps", () => {
  it("is granted to President and DevOps Director, and to no other seeded role", async () => {
    const rows = await db.execute<{ id: string; granted: boolean | null }>(sql`
      select id, "canManageOAuthApps" as granted from platform.roles
      where "roleType" = 'custom' and "isLeadership"
    `);
    const granted = new Set(rows.filter((r) => r.granted).map((r) => r.id));
    expect(granted).toEqual(new Set([PRESIDENT, DEVOPS_DIRECTOR]));
    expect(rows.some((r) => r.id === VICE_PRESIDENT)).toBe(true);
  });

  it("resolves through the materialized view for a member holding such a role", async () => {
    await db.execute(sql`
      insert into platform.roles (id, title, rank, "canManageOAuthApps")
      values (${IDS.role}::uuid, 'Tiers db-test role', 987654, true)
    `);
    await db.execute(sql`
      insert into platform."userRoles" ("userId", "roleId")
      values (${IDS.holder}::uuid, ${IDS.role}::uuid)
    `);

    const rows = await db.execute<{ uid: string; allowed: boolean }>(sql`
      select u.id as uid,
             platform.has_permission(u.id, 'canManageOAuthApps') as allowed
      from auth.users u
      where u.id in (${IDS.holder}::uuid, ${IDS.bystander}::uuid)
    `);
    expect(Object.fromEntries(rows.map((r) => [r.uid, r.allowed]))).toEqual({
      [IDS.holder]: true,
      [IDS.bystander]: false,
    });
  });
});

describe("audit entries", () => {
  it("fit platform.auditEvents and carry the tier, the client and no secret", async () => {
    const event = oauthAuditEvent({
      actorUserId: IDS.owner,
      action: "oauth_client.created",
      clientId: IDS.productionClient,
      metadata: { label: "DogDays", redirectUris: callback },
    });
    const [row] = await db.insert(auditEvents).values(event).returning({
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      source: auditEvents.source,
      actorType: auditEvents.actorType,
    });

    expect(row).toEqual({
      action: "oauth_client.created",
      targetType: "oauth_client",
      targetId: IDS.productionClient,
      source: "platform",
      actorType: "user",
      metadata: {
        tier: "production",
        label: "DogDays",
        redirectUris: callback,
      },
    });
  });

  it("are append-only", async () => {
    await rejectsWith(
      sql`update platform."auditEvents" set action = 'tampered'
          where "actorUserId" = ${IDS.owner}::uuid`,
      /append-only/,
    );
  });
});

describe("findConsentTarget", () => {
  beforeAll(async () => {
    await db.execute(sql`
      insert into auth.oauth_authorizations
        (id, authorization_id, client_id, user_id, redirect_uri, scope, status)
      values
        (gen_random_uuid(), 'tiers-db-test-dev', ${IDS.devClient}::uuid, null,
         'http://127.0.0.1:54321/auth/v1/callback', 'openid email profile', 'pending'),
        (gen_random_uuid(), 'tiers-db-test-production', ${IDS.productionClient}::uuid, null,
         ${callback}, 'openid email profile', 'pending')
    `);
  });

  it("reads the tier, the owner and the stored return address", async () => {
    expect(await findConsentTarget("tiers-db-test-production")).toEqual({
      ownerUserId: IDS.owner,
      tier: "production",
      redirectUri: callback,
    });
    expect(await findConsentTarget("tiers-db-test-dev")).toEqual({
      ownerUserId: IDS.owner,
      tier: "development",
      redirectUri: "http://127.0.0.1:54321/auth/v1/callback",
    });
  });

  it("is null for an id nobody issued", async () => {
    expect(await findConsentTarget("tiers-db-test-nope")).toBeNull();
  });

  it("is null when the client was never registered", async () => {
    await db.execute(sql`
      delete from platform."oauthRegistrations"
      where "clientId" = ${IDS.productionClient}::uuid
    `);
    expect(await findConsentTarget("tiers-db-test-production")).toBeNull();
  });
});
