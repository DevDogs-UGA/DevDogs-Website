CREATE OR REPLACE FUNCTION platform.audit_report_corroborated()
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
    'user', new."reporterUserId", 'platform', 'moderation.report_corroborated',
    'report', new."reportId"::text,
    jsonb_build_object('reason', new."reason")
  );
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."audit_report_corroborated"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."audit_report_corroborated"() FROM PUBLIC;
