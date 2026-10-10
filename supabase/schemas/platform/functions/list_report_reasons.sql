CREATE OR REPLACE FUNCTION platform.list_report_reasons()
  RETURNS TABLE (
    reason      platform."reportReason",
    title       text,
    description text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select r."reason", r."title"::text, r."description"
  from "platform"."reportReasons" r
  order by r."position";
$function$;

GRANT EXECUTE ON FUNCTION "platform"."list_report_reasons"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."list_report_reasons"() FROM PUBLIC;
