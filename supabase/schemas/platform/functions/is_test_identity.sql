CREATE OR REPLACE FUNCTION platform.is_test_identity (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from "platform"."oauthTestAccounts" t where t."testUserId" = uid
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."is_test_identity"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."is_test_identity"(uuid) FROM PUBLIC;
