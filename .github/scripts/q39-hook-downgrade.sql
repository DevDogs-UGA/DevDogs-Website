-- Q39 check 3: the access-token hook downgrades an OAuth client's token.
--
-- Run against STAGING with the deploy credential (it inserts into auth.users):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f q39-hook-downgrade.sql
--
-- Everything happens in one transaction that is rolled back at the end, so the
-- database is left exactly as it was whether the check passes or fails. It
-- calls `platform.restrict_oauth_tokens` directly with the event shape GoTrue
-- sends (`user_id` plus the draft `claims`):
--
--   * a token that carries an OAuth client's id is an identity and nothing
--     else: its role becomes `oauth_identity` (no data access), never
--     `authenticated`, whichever tier the client has and whoever signed in
--     (the client's owner, or a stranger). Sign-in to a client is decided on
--     the consent page now, so the hook no longer refuses anyone;
--   * a token for a client nobody registered gets the same downgrade;
--   * a token with no client (a first-party session) keeps `authenticated`.
--
-- The hook has only ever had to hold the first rule. A refusal (an `error`
-- key instead of claims) also passes for the stranger, so this check does not
-- go red if an older hook is deployed during a rollout.
--
-- The registration's tier column is `tier` (`type` before the OAuth tier
-- rework); the row is inserted WITH its tier, because the tier is immutable
-- once written.
begin;

do $check$
declare
  owner_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  client_id uuid;
  kind text;
  tier_col text;
  tier_type text;
  result jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q39-owner@q39.devdogsuga.test'),
    (stranger_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q39-stranger@q39.devdogsuga.test');

  select c.column_name, format('%I.%I', c.udt_schema, c.udt_name)
    into tier_col, tier_type
    from information_schema.columns c
   where c.table_schema = 'platform'
     and c.table_name = 'oauthRegistrations'
     and c.column_name in ('tier', 'type')
   order by (c.column_name = 'tier') desc
   limit 1;

  foreach kind in array array['development', 'production'] loop
    client_id := gen_random_uuid();
    insert into auth.oauth_clients (
      id, client_secret_hash, registration_type, redirect_uris, grant_types,
      client_name, client_type, token_endpoint_auth_method, created_at, updated_at
    )
    values (
      client_id, '', 'manual', 'http://localhost:3000/cb',
      'authorization_code,refresh_token', 'q39 ' || kind, 'public', 'none', now(), now()
    );
    if tier_col is not null then
      execute format(
        'insert into platform."oauthRegistrations" ("clientId", "userId", %I) values ($1, $2, %L::%s)',
        tier_col, kind, tier_type
      ) using client_id, owner_id;
    else
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (client_id, owner_id);
    end if;

    result := platform.restrict_oauth_tokens(jsonb_build_object(
      'user_id', owner_id,
      'claims', jsonb_build_object('role', 'authenticated', 'client_id', client_id)
    ));
    if result -> 'claims' ->> 'role' is distinct from 'oauth_identity' then
      raise exception 'q39: a % client''s token for its owner was not downgraded: %', kind, result;
    end if;

    result := platform.restrict_oauth_tokens(jsonb_build_object(
      'user_id', stranger_id,
      'claims', jsonb_build_object('role', 'authenticated', 'client_id', client_id)
    ));
    if result -> 'claims' ->> 'role' = 'authenticated' then
      raise exception 'q39: a % client issued a stranger an undowngraded token: %', kind, result;
    end if;
    if not (result ? 'error') and result -> 'claims' ->> 'role' is distinct from 'oauth_identity' then
      raise exception 'q39: a % client''s token for a stranger was neither refused nor downgraded: %', kind, result;
    end if;
  end loop;

  result := platform.restrict_oauth_tokens(jsonb_build_object(
    'user_id', stranger_id,
    'claims', jsonb_build_object('role', 'authenticated', 'client_id', gen_random_uuid())
  ));
  if result -> 'claims' ->> 'role' = 'authenticated' then
    raise exception 'q39: a token for a client nobody registered kept the authenticated role: %', result;
  end if;

  result := platform.restrict_oauth_tokens(jsonb_build_object(
    'user_id', owner_id,
    'claims', jsonb_build_object('role', 'authenticated')
  ));
  if result -> 'claims' ->> 'role' is distinct from 'authenticated' then
    raise exception 'q39: a first-party token (no client) was changed: %', result;
  end if;

  raise notice 'q39: the hook downgrades development and production client tokens';
end
$check$;

rollback;
