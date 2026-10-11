-- OAuth client tiers (lane 3c): who may mint a first-party client, and what the
-- token hook is still responsible for.
--
-- "Sign in with DevDogs" now has two kinds of client, chosen once, when the
-- client is created:
--
--   development  a member's own client for local testing. Consent keeps the
--                owner-and-test-accounts form (`/oauth/consent`), as before.
--   production   a first-party client, one per DevDogs app (DogDays, DogPack).
--                Only a holder of `canManageOAuthApps` can create one, and
--                consent approves it automatically for whoever is signed in,
--                provided its return address is an https Supabase callback.
--
-- Three changes make that real, and all three are here because the columns and
-- the function have to move together:
--
-- 1. `oauthRegistrations."tier"`. `"type"` already exists in migration 04 with
--    the same two values and was never read or written. It stays for now: a
--    rename or drop here would break the Worker that is still deployed when
--    this migration runs (migrations run before the platform deploy), and a
--    column drop ships one deploy after its last reader. The follow-up that
--    drops `"type"` and the `oauthRegistrationType` enum is a separate change.
--    `"tier"` is a new column with a default, so the old Worker's inserts and
--    selects are unaffected. It is backfilled from `"type"` (every row is
--    'development' today), and a trigger makes it immutable: "a client can't
--    change tier after creation" is enforced in the database, not only in the
--    form.
--
-- 2. `roles."canManageOAuthApps"`. A permission is only real in three places
--    (file 06): the column, the materialized view body and the roles trigger's
--    `update of` list; the view cannot gain a column in place, so it is dropped
--    and rebuilt exactly as file 40 did it. President and DevOps Director get
--    the permission; roles someone created by hand are left alone. Seeds are
--    insert-only, so the grant for a database that already has the roles has to
--    be here.
--
-- 3. `platform.restrict_oauth_tokens` is reduced to the downgrade. It used to
--    refuse a token unless the client was registered and the user was its owner
--    or one of the owner's test accounts. That check moved to the consent page,
--    where a production client needs no such relationship at all (the token
--    for a DogDays sign-in belongs to whichever member signs in). What
--    remains is the part that matters for safety: every token that carries an
--    OAuth client gets role `oauth_identity`, which has no privileges anywhere,
--    so it can read nothing but GoTrue's userinfo. It still runs on the first
--    exchange and on every refresh, for every tier.
--
--    The accepted gap (platform-eval Q13): GoTrue's own consent endpoint
--    accepts any signed-in user's session, so a member with a script can
--    approve somebody else's *development* client as themselves. The token
--    they get is the downgraded one and can only identify them to that client.

-- 1. Tier ---------------------------------------------------------------------

create type "platform"."oauthTier" as enum ('development', 'production');

alter table "platform"."oauthRegistrations"
  add column "tier" "platform"."oauthTier" not null
    default 'development'::"platform"."oauthTier";

update "platform"."oauthRegistrations"
   set "tier" = "type"::text::"platform"."oauthTier";

create function "platform".reject_oauth_tier_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'an OAuth client''s tier cannot change after creation'
    using errcode = '55000';
end;
$$;

create trigger "oauthRegistrations_tier_immutable"
  before update of "tier" on "platform"."oauthRegistrations"
  for each row
  when (old."tier" is distinct from new."tier")
  execute function "platform".reject_oauth_tier_change();

-- 2. Permission ---------------------------------------------------------------

alter table "platform"."roles" add column "canManageOAuthApps" boolean;

drop trigger "roles_refresh_resolved_permissions" on "platform"."roles";

drop materialized view "platform"."resolvedUserPermissions";

create materialized view "platform"."resolvedUserPermissions" as
with user_custom_roles as (
  select
    ur."userId",
    r.rank,
    r."isLeadership",
    r."canModerate",
    r."canManageRoles",
    r."canManageSuspensions",
    r."canViewAuditLog",
    r."canManageAttendance",
    r."canPreviewDocs",
    r."canManageOAuthApps"
  from "platform"."userRoles" ur
  inner join "platform"."roles" r on r.id = ur."roleId" and r."roleType" = 'custom'
),
first_non_null as (
  select
    ucr."userId",
    min(ucr.rank) as "minRank",
    bool_or(ucr."isLeadership") as "isLeader",
    (array_agg(ucr."canModerate" order by ucr.rank asc) filter (where ucr."canModerate" is not null))[1] as "canModerate",
    (array_agg(ucr."canManageRoles" order by ucr.rank asc) filter (where ucr."canManageRoles" is not null))[1] as "canManageRoles",
    (array_agg(ucr."canManageSuspensions" order by ucr.rank asc) filter (where ucr."canManageSuspensions" is not null))[1] as "canManageSuspensions",
    (array_agg(ucr."canViewAuditLog" order by ucr.rank asc) filter (where ucr."canViewAuditLog" is not null))[1] as "canViewAuditLog",
    (array_agg(ucr."canManageAttendance" order by ucr.rank asc) filter (where ucr."canManageAttendance" is not null))[1] as "canManageAttendance",
    (array_agg(ucr."canPreviewDocs" order by ucr.rank asc) filter (where ucr."canPreviewDocs" is not null))[1] as "canPreviewDocs",
    (array_agg(ucr."canManageOAuthApps" order by ucr.rank asc) filter (where ucr."canManageOAuthApps" is not null))[1] as "canManageOAuthApps"
  from user_custom_roles ucr
  group by ucr."userId"
),
all_users as (
  select distinct "userId" from "platform"."userRoles"
)
select
  au."userId",
  coalesce(fnn."canModerate", false) as "canModerate",
  coalesce(fnn."canManageRoles", false) as "canManageRoles",
  coalesce(fnn."canManageSuspensions", false) as "canManageSuspensions",
  coalesce(fnn."canViewAuditLog", false) as "canViewAuditLog",
  coalesce(fnn."canManageAttendance", false) as "canManageAttendance",
  coalesce(fnn."canPreviewDocs", false) as "canPreviewDocs",
  coalesce(fnn."canManageOAuthApps", false) as "canManageOAuthApps",
  coalesce(fnn."isLeader", false) as "isLeader",
  coalesce(fnn."minRank", 'Infinity'::double precision) as "minRank"
from all_users au
left join first_non_null fnn on fnn."userId" = au."userId";

create unique index "resolvedUserPermissions_userId_idx"
  on "platform"."resolvedUserPermissions" ("userId");

grant all on "platform"."resolvedUserPermissions"
  to anon, authenticated, service_role;

create trigger "roles_refresh_resolved_permissions"
  after insert
     or update of
          "id",
          "rank",
          "isLeadership",
          "roleType",
          "canModerate",
          "canManageRoles",
          "canManageSuspensions",
          "canViewAuditLog",
          "canManageAttendance",
          "canPreviewDocs",
          "canManageOAuthApps"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();

-- President and DevOps Director, by their fixed ids. The update fires the
-- trigger above, which refreshes the snapshot.
update "platform"."roles"
set "canManageOAuthApps" = true
where "id" in (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);

-- 3. The hook, reduced to the downgrade ----------------------------------------

create or replace function "platform".restrict_oauth_tokens(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  client_id uuid;
begin
  -- GoTrue puts `client_id` on tokens it issues to OAuth clients. The session
  -- row records the same client, so check it too: either one marks the token
  -- as an OAuth client's, and a token without either is a first-party one.
  client_id := nullif(claims ->> 'client_id', '')::uuid;

  if client_id is null then
    select s.oauth_client_id
      into client_id
      from auth.sessions s
     where s.id = nullif(claims ->> 'session_id', '')::uuid;
  end if;

  if client_id is null then
    return jsonb_build_object('claims', claims);
  end if;

  -- Whoever the client is, and whoever signed in, the token is an identity and
  -- nothing else: `oauth_identity` has no grants on any schema.
  return jsonb_build_object(
    'claims', jsonb_set(claims, '{role}', '"oauth_identity"')
  );
end;
$$;
