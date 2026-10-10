CREATE OR REPLACE FUNCTION platform.handle_is_valid (
  candidate text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select candidate is not null
    and candidate ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    and char_length(candidate) between 2 and 39;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."handle_is_valid"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."handle_is_valid"(text) FROM PUBLIC;
