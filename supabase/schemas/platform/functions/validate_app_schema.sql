CREATE OR REPLACE FUNCTION platform.validate_app_schema()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- External apps have no schema to check; the table's check constraint is what
  -- keeps a null schema from reaching an internal app.
  if new."schemaName" is null then
    return new;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_namespace where nspname = new."schemaName"
  ) then
    raise exception 'platform.apps: schema "%" does not exist', new."schemaName";
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."validate_app_schema"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."validate_app_schema"() FROM PUBLIC;
