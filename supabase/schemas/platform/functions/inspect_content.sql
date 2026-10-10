CREATE OR REPLACE FUNCTION platform.inspect_content (
  app_slug     text,
  content_type text,
  content_ref  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'inspect_content() requires the canModerate permission';
  end if;
  return "platform".resolve_content(app_slug, content_type, content_ref);
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."inspect_content"(text, text, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."inspect_content"(text, text, text) FROM PUBLIC;
