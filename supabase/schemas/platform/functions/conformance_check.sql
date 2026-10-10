CREATE OR REPLACE FUNCTION platform.conformance_check (
  app_slug text
)
  RETURNS TABLE (
    "contentType" text,
    "tableName"   text,
    checks        jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  rec record;
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  for rec in
    select
      e.value ->> 'contentType' as ct,
      e.value ->> 'tableName'   as tn,
      e.value -> 'checks'       as ck
    from jsonb_array_elements("platform".conformance_report(app_slug)) as e(value)
  loop
    "contentType" := rec.ct;
    "tableName"   := rec.tn;
    "checks"      := rec.ck;
    return next;
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."conformance_check"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."conformance_check"(text) FROM PUBLIC;
