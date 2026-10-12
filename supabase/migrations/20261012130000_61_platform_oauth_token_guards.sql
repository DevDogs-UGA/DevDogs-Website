-- What a token issued to an OAuth client can still do inside GoTrue (lane 3c
-- review fixes).
--
-- Migration 57 reduced the token hook to a downgrade: an access token issued
-- to an OAuth client gets role `oauth_identity`, which has no grants, so it
-- reads nothing through PostgREST. That is true of PostgREST only. GoTrue's own
-- /auth/v1/user endpoints authenticate the bearer by signature and `sub`, and
-- they do not look at the role, at `client_id`, or (for the ID token) at a
-- session at all:
--
--   - the ID token a client receives with its code exchange is a bearer too,
--     and the token hook never sees it, so no hook can downgrade it;
--   - with either token, `PUT /auth/v1/user` rewrites the member's record,
--     including `{"password": ...}`, after which a password sign-in returns a
--     full `authenticated` session;
--   - `GET /auth/v1/user/identities/authorize` starts linking a new identity
--     (`enable_manual_linking` is on), so the holder can attach their own
--     GitHub or Google account to the member and then sign in as them.
--
-- GoTrue does not tell the database which token a write came from, so the
-- guard has to hold for every request GoTrue serves and key on what the
-- platform itself does. Both triggers act only on statements that arrive on a
-- GoTrue connection (`session_user` is `supabase_auth_admin`); migrations, the
-- test fixtures and an operator's psql session are not the attack and are left
-- alone.
--
-- 1. Nobody sets a password. OAuth is the only way into a deployed project;
--    the password grant exists for local test personas, which are created with
--    their password (an insert, not an update). A change of `encrypted_password`
--    to a non-empty value is refused. GoTrue rewrites the whole row on most
--    updates, so the trigger fires on the value changing, not on the column
--    being named.
--
-- 2. A second identity is added only if the platform started the link, or the
--    provider vouches for the account's own address. The platform records
--    `identityLinkIntents` (user, provider, a short expiry) from a first-party
--    session just before it calls `linkIdentity`, and the identities trigger
--    consumes it. Without an intent an insert still passes when it is the
--    account's first identity (sign-up itself) or when the identity's verified
--    email is the account's email (GoTrue's automatic linking), which a client
--    holding a stolen bearer cannot arrange for an account it does not own.
--
-- Both are triggers on auth tables. `postgres` holds the trigger privilege on
-- them (`arwdDxtm`), the same one every project uses for a sign-up trigger on
-- auth.users.
--
-- Lane 3d, the other half of the review. GoTrue soft-deletes OAuth clients, so
-- the cascade from `auth.oauth_clients` to `moderationClients` never fires: a
-- deleted production client stayed bound to its external app, kept filing
-- reports that reached moderators, and kept its delivery endpoint. A trigger on
-- the soft delete drops the registration, whoever deleted the client.

-- 1. No password changes ------------------------------------------------------

create function "platform".reject_password_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if session_user <> 'supabase_auth_admin' then
    return new;
  end if;
  raise exception 'passwords cannot be set on this project; sign in with an identity provider'
    using errcode = '55000';
end;
$$;

create trigger "users_reject_password_change"
  before update of "encrypted_password" on "auth"."users"
  for each row
  when (
    old."encrypted_password" is distinct from new."encrypted_password"
    and coalesce(new."encrypted_password", '') <> ''
  )
  execute function "platform".reject_password_change();

-- 2. Identity links the platform started --------------------------------------

create table "platform"."identityLinkIntents" (
  "userId" uuid not null,
  "provider" text not null,
  "expiresAt" timestamp with time zone not null,

  constraint "identityLinkIntents_pkey" primary key ("userId", "provider"),
  constraint "identityLinkIntents_userId_users_id_fkey"
    foreign key ("userId") references "auth"."users" ("id")
    on update cascade on delete cascade
);

alter table "platform"."identityLinkIntents" enable row level security;

revoke all on table "platform"."identityLinkIntents" from "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "platform"."identityLinkIntents" to "postgres", "service_role";

create function "platform".guard_identity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_email text;
begin
  -- Only what GoTrue does on a request is guarded.
  if session_user <> 'supabase_auth_admin' then
    return new;
  end if;

  -- An account's first identity is the sign-up itself.
  if not exists (
    select 1 from "auth"."identities" i where i."user_id" = new."user_id"
  ) then
    return new;
  end if;

  -- Automatic linking: the provider vouches for the account's own address.
  select u."email" into account_email
    from "auth"."users" u where u."id" = new."user_id";
  if account_email is not null
     and lower(new."identity_data" ->> 'email') = lower(account_email)
     and new."identity_data" ->> 'email_verified' = 'true' then
    return new;
  end if;

  -- Manual linking: only one this site started, once.
  delete from "platform"."identityLinkIntents" l
   where l."userId" = new."user_id"
     and l."provider" = new."provider"
     and l."expiresAt" > now();
  if found then
    return new;
  end if;

  raise exception 'identities can only be linked from your DevDogs account page'
    using errcode = '55000';
end;
$$;

revoke all on function "platform".guard_identity_link() from public, anon, authenticated;

create trigger "identities_guard_link"
  before insert on "auth"."identities"
  for each row
  execute function "platform".guard_identity_link();

-- 3. A deleted OAuth client leaves the moderation registry --------------------

create function "platform".drop_moderation_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from "platform"."moderationClients" m where m."clientId" = new."id";
  return null;
end;
$$;

revoke all on function "platform".drop_moderation_registration() from public, anon, authenticated;

create trigger "oauth_clients_drop_moderation_registration"
  after update of "deleted_at" on "auth"."oauth_clients"
  for each row
  when (old."deleted_at" is null and new."deleted_at" is not null)
  execute function "platform".drop_moderation_registration();

-- Registrations whose client was soft-deleted before this trigger existed.
delete from "platform"."moderationClients" m
 using "auth"."oauth_clients" c
 where c."id" = m."clientId" and c."deleted_at" is not null;
