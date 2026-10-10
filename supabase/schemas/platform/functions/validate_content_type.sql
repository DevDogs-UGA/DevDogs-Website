CREATE OR REPLACE FUNCTION platform.validate_content_type()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  schema_name text;
  rel_oid oid;
  col text;
begin
  select a."schemaName" into schema_name
  from "platform"."apps" a where a."id" = new."appId";

  select c.oid into rel_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = schema_name
    and c.relname = new."tableName"
    and c.relkind in ('r', 'p');

  if rel_oid is null then
    raise exception 'platform.contentTypes: table "%"."%" does not exist',
      schema_name, new."tableName";
  end if;

  if new."authorColumn" is not null
     and not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = rel_oid and attname = new."authorColumn"
         and attnum > 0 and not attisdropped
     ) then
    raise exception 'platform.contentTypes: "%"."%" has no column "%"',
      schema_name, new."tableName", new."authorColumn";
  end if;

  foreach col in array coalesce(new."snapshotColumns", '{}'::text[]) loop
    if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = rel_oid and attname = col
        and attnum > 0 and not attisdropped
    ) then
      raise exception 'platform.contentTypes: "%"."%" has no column "%"',
        schema_name, new."tableName", col;
    end if;
  end loop;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."validate_content_type"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."validate_content_type"() FROM PUBLIC;
