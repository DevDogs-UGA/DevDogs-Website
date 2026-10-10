CREATE OR REPLACE FUNCTION platform.set_handle (
  uid        uuid,
  new_handle text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid := (select auth.uid());
  wanted text := lower(btrim(new_handle));
  offered boolean;
begin
  if caller is not null and caller <> uid then
    raise exception 'set_handle: not your profile' using errcode = '42501';
  end if;

  if not exists (select 1 from "platform"."profile" p where p."userId" = uid) then
    return 'no_profile';
  end if;

  if "platform".is_profile_frozen(uid) or "platform".is_suspended(uid) then
    return 'blocked';
  end if;

  select o.available into offered
    from "platform"."handle_options"(uid) o
   where o.handle = wanted;

  if offered is null then
    return 'not_offered';
  end if;
  if not offered then
    return 'taken';
  end if;

  begin
    update "platform"."profile" set "handle" = wanted where "userId" = uid;
  exception when unique_violation then
    return 'taken';
  end;

  return 'set';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."set_handle"(uuid, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."set_handle"(uuid, text) FROM PUBLIC;
