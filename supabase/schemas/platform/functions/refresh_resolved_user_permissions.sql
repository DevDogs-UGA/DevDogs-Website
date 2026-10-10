CREATE OR REPLACE FUNCTION platform.refresh_resolved_user_permissions()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- CONCURRENTLY so readers keep being served mid-refresh, which matters when a
  -- permission read sits in the path of essentially every page render. It needs
  -- the unique index on "userId" above and takes an ExclusiveLock: SELECTs pass,
  -- a second concurrent refresh waits.
  refresh materialized view concurrently platform."resolvedUserPermissions";
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."refresh_resolved_user_permissions"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."refresh_resolved_user_permissions"() FROM PUBLIC;
