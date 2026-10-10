CREATE OR REPLACE FUNCTION platform.is_suspended (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from "platform"."userSuspensions" s
    where s."userId" = uid and s."service" = 'global'
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."is_suspended"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."is_suspended"(uuid) FROM PUBLIC;
