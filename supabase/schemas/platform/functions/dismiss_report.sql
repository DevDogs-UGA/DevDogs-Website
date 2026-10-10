CREATE OR REPLACE FUNCTION platform.dismiss_report (
  report_id      uuid,
  moderator_note text DEFAULT NULL::text
)
  RETURNS TABLE (
    dismissed boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform "platform".dismiss_report_as(
    (select auth.uid()), report_id, moderator_note
  );
  return query select true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."dismiss_report"(uuid, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."dismiss_report"(uuid, text) FROM PUBLIC;
