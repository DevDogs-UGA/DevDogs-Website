CREATE OR REPLACE FUNCTION platform.handle_suffixed (
  uid  uuid,
  base text
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  n integer := 2;
  candidate text;
begin
  if base is null then
    return null;
  end if;
  loop
    candidate := left(base, 39 - char_length(n::text)) || n::text;
    exit when "platform"."handle_is_valid"(candidate)
      and not exists (
        select 1 from "platform"."profile" other
        where other."handle" = candidate and other."userId" <> uid
      );
    n := n + 1;
  end loop;
  return candidate;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."handle_suffixed"(uuid, text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."handle_suffixed"(uuid, text) FROM PUBLIC;
