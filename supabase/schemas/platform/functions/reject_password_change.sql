CREATE OR REPLACE FUNCTION platform.reject_password_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if session_user <> 'supabase_auth_admin' then
    return new;
  end if;
  raise exception 'passwords cannot be set on this project; sign in with an identity provider'
    using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reject_password_change"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reject_password_change"() FROM PUBLIC;
