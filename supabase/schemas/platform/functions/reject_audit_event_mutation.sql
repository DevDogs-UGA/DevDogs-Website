CREATE OR REPLACE FUNCTION platform.reject_audit_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'beforeReflectionRevisionId' - 'afterReflectionRevisionId')
      = (to_jsonb(old) - 'beforeReflectionRevisionId' - 'afterReflectionRevisionId')
    and (
      new."beforeReflectionRevisionId" is not distinct from old."beforeReflectionRevisionId"
      or (
        new."beforeReflectionRevisionId" is null
        and not exists (
          select 1 from "platform"."reflectionRevisions" v
           where v."id" = old."beforeReflectionRevisionId"
        )
      )
    )
    and (
      new."afterReflectionRevisionId" is not distinct from old."afterReflectionRevisionId"
      or (
        new."afterReflectionRevisionId" is null
        and not exists (
          select 1 from "platform"."reflectionRevisions" v
           where v."id" = old."afterReflectionRevisionId"
        )
      )
    )
  then
    return new;
  end if;

  raise exception 'audit events are append-only' using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reject_audit_event_mutation"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reject_audit_event_mutation"() FROM PUBLIC;
