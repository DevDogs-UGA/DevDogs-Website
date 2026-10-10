CREATE OR REPLACE FUNCTION platform.restrict_oauth_tokens (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  claims jsonb := event -> 'claims';
  user_id uuid := (event ->> 'user_id')::uuid;
  client_id uuid;
  owner_id uuid;
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

  select r."userId"
    into owner_id
    from "platform"."oauthRegistrations" r
   where r."clientId" = client_id;

  if owner_id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This OAuth client is not registered to a DevDogs member.'
      )
    );
  end if;

  if user_id is distinct from owner_id and not exists (
    select 1
      from "platform"."oauthTestAccounts" t
     where t."testUserId" = user_id
       and t."ownerUserId" = owner_id
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign in with DevDogs only signs in the client''s owner or their test accounts.'
      )
    );
  end if;

  return jsonb_build_object(
    'claims', jsonb_set(claims, '{role}', '"oauth_identity"')
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."restrict_oauth_tokens"(jsonb) TO "postgres", "service_role", "supabase_auth_admin";

REVOKE ALL ON FUNCTION "platform"."restrict_oauth_tokens"(jsonb) FROM PUBLIC;
