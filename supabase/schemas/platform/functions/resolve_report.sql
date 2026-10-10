CREATE OR REPLACE FUNCTION platform.resolve_report (
  report_id      uuid,
  subject_action platform."subjectAction",
  filer_action   platform."filerAction",
  content_action platform."contentAction",
  moderator_note text                     DEFAULT NULL::text,
  apply_globally boolean                  DEFAULT false
)
  RETURNS TABLE (
    "resolutionId" uuid,
    "bannedUserId" uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  result jsonb;
begin
  result := "platform".resolve_report_as(
    (select auth.uid()), report_id, subject_action, filer_action,
    content_action, moderator_note, apply_globally
  );
  return query select
    (result ->> 'resolutionId')::uuid,
    (result ->> 'bannedUserId')::uuid;
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "platform"."resolve_report"(uuid, platform."subjectAction", platform."filerAction", platform."contentAction", text, boolean)
  TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."resolve_report"(uuid, platform."subjectAction", platform."filerAction", platform."contentAction", text, boolean) FROM PUBLIC;
