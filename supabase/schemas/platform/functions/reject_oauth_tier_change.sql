CREATE OR REPLACE FUNCTION platform.reject_oauth_tier_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception 'an OAuth client''s tier cannot change after creation'
    using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reject_oauth_tier_change"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reject_oauth_tier_change"() FROM PUBLIC;
