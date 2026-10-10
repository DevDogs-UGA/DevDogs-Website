CREATE OR REPLACE FUNCTION platform.reject_survey_answer_revision_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'survey answer revisions are append-only' using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reject_survey_answer_revision_mutation"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reject_survey_answer_revision_mutation"() FROM PUBLIC;
