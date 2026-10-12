CREATE OR REPLACE FUNCTION platform.moderation_client_tier (
  p_client_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  found_tier text;
begin
  -- The tier column arrives with the OAuth tiers change. Until it exists
  -- there is nothing to enforce, and the registry alone decides.
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid = '"platform"."oauthRegistrations"'::regclass
      and a.attname = 'tier' and not a.attisdropped
  ) then
    return null;
  end if;
  execute 'select "tier"::text from "platform"."oauthRegistrations" where "clientId" = $1'
    into found_tier using p_client_id;
  return found_tier;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."moderation_client_tier"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."moderation_client_tier"(uuid) FROM PUBLIC;
