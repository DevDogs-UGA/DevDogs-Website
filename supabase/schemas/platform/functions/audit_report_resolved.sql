CREATE OR REPLACE FUNCTION platform.audit_report_resolved()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  event_action text;
begin
  event_action := case
    when new."subjectAction" = 'no_action'
     and new."filerAction" = 'no_action'
     and new."contentAction" = 'no_action'
    then 'moderation.report_dismissed'
    else 'moderation.report_resolved'
  end;

  insert into "platform"."auditEvents" (
    "actorType", "actorUserId", "source", "action",
    "targetType", "targetId", "metadata"
  ) values (
    'user', new."moderatorUserId", 'platform', event_action,
    'report', new."reportId"::text,
    jsonb_build_object(
      'resolutionId', new."id",
      'subjectAction', new."subjectAction",
      'filerAction', new."filerAction",
      'contentAction', new."contentAction",
      'appliedGlobally', new."appliedGlobally"
    )
  );
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."audit_report_resolved"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."audit_report_resolved"() FROM PUBLIC;
