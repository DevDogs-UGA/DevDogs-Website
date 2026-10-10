CREATE OR REPLACE FUNCTION platform.audit_report_created()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into "platform"."auditEvents" (
    "actorType", "actorUserId", "source", "action",
    "targetType", "targetId", "metadata"
  ) values (
    'user', new."reporterUserId", 'platform', 'moderation.report_created',
    'report', new."id"::text,
    jsonb_build_object(
      'appId', new."appId",
      'contentType', new."contentType",
      'reason', new."reason"
    )
  );
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."audit_report_created"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."audit_report_created"() FROM PUBLIC;
