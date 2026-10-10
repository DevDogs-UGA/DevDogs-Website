CREATE OR REPLACE FUNCTION platform.is_active_team_member (
  team_id uuid,
  uid     uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from "platform"."teamMembers"
    where "teamId" = team_id and "userId" = uid and "leftAt" is null
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."is_active_team_member"(uuid, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."is_active_team_member"(uuid, uuid) FROM PUBLIC;
