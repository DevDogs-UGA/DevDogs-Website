-- Q39 check 3: the access-token hook downgrades an OAuth client's token.
--
-- Run against STAGING with the deploy credential (it inserts into auth.users):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f q39-hook-downgrade.sql
--
-- Everything happens in one transaction that is rolled back at the end, so the
-- database is left exactly as it was whether the check passes or fails. It
-- calls `platform.restrict_oauth_tokens` directly with the event shape GoTrue
-- sends (`user_id` plus the draft `claims`), once for a development client and
-- once for a production one:
--
--   * the client's owner gets a token whose role is `oauth_identity` (no data
--     access), never `authenticated`;
--   * a stranger never gets an `authenticated` token: they are refused, or (a
--     production client, once any member may sign in to it) downgraded the
--     same way. A development client must refuse them.
--
-- The registration's tier column is `type` today; the check finds whichever of
-- `tier` or `type` the table has, so the OAuth tier rework does not break it.
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
    insert into platform."oauthRegistrations" ("clientId", "userId")
    values (client_id, owner_id);
    if tier_col is not null then
      execute format(
        'update platform."oauthRegistrations" set %I = %L::%s where "clientId" = $1',
        tier_col, kind, tier_type
      ) using client_id;
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
    if kind = 'development' and not (result ? 'error') then
      raise exception 'q39: a development client must refuse a stranger: %', result;
    end if;
  end loop;

  raise notice 'q39: the hook downgrades development and production client tokens';
end
$check$;

rollback;
