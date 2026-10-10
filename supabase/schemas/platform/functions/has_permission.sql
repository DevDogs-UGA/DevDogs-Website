CREATE OR REPLACE FUNCTION platform.has_permission (
  uid  uuid,
  perm text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(
    (
      select (to_jsonb(r) ->> perm)::boolean
      from "platform"."resolvedUserPermissions" r
      where r."userId" = uid
    ),
    false
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."has_permission"(uuid, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."has_permission"(uuid, text) FROM PUBLIC;
