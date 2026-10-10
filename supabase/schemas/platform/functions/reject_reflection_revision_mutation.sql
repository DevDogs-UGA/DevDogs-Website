CREATE OR REPLACE FUNCTION platform.reject_reflection_revision_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from "platform"."reflections" r where r."id" = old."reflectionId"
  ) then
    return old;
  end if;

  raise exception 'reflection revisions are append-only' using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reject_reflection_revision_mutation"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reject_reflection_revision_mutation"() FROM PUBLIC;
