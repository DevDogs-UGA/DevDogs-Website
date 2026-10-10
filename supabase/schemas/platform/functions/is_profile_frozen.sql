CREATE OR REPLACE FUNCTION platform.is_profile_frozen (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from "platform"."profile" p
    where p."userId" = uid and p."quarantinedBy" is not null
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."is_profile_frozen"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."is_profile_frozen"(uuid) FROM PUBLIC;
