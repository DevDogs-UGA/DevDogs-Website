CREATE OR REPLACE FUNCTION platform.list_content_types (
  app_slug text DEFAULT NULL::text
)
  RETURNS TABLE (
    "appId"            uuid,
    "appSlug"          text,
    "schemaName"       text,
    "tableName"        text,
    "contentType"      text,
    label              text,
    "refColumn"        text,
    "authorColumn"     text,
    "snapshotColumns"  text[],
    "urlTemplate"      text,
    visibility         platform."contentVisibility",
    "quarantineColumn" text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select c.*
  from "platform".content_types() c
  where "platform".has_permission((select auth.uid()), 'canModerate')
    and (app_slug is null or c."appSlug" = app_slug)
  order by c."appSlug", c."contentType";
$function$;

GRANT EXECUTE ON FUNCTION "platform"."list_content_types"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."list_content_types"(text) FROM PUBLIC;
