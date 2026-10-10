CREATE OR REPLACE FUNCTION platform.audit_export_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into "platform"."auditEvents" (
    "actorType",
    "actorUserId",
    "source",
    "action",
    "targetType",
    "targetId",
    "metadata"
  ) values (
    case when new."userId" is null then 'system' else 'user' end,
    new."userId",
    'platform',
    'export.created',
    'export',
    new."id"::text,
    jsonb_build_object(
      'kind', new."kind",
      'filters', new."filters",
      'rowCount', new."rowCount"
    )
  );
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."audit_export_insert"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."audit_export_insert"() FROM PUBLIC;
