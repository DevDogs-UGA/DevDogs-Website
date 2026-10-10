CREATE OR REPLACE FUNCTION platform.handle_options (
  uid uuid
)
  RETURNS TABLE (
    kind      text,
    handle    text,
    available boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid := (select auth.uid());
  base text;
  suffixed text;
begin
  if caller is not null and caller <> uid then
    raise exception 'handle_options: not your profile' using errcode = '42501';
  end if;

  if exists (select 1 from "platform"."handle_candidates"(uid) c where c.available) then
    return query
      select c.kind, c.handle, c.available
        from "platform"."handle_candidates"(uid) c
       order by c.ord;
    return;
  end if;

  -- Either there are no candidates at all, or every one is taken. Suffix the
  -- member's preferred_initial, computed directly rather than read from the
  -- candidates (an identical earlier kind may have absorbed it), else their
  -- first valid name candidate.
  select p."handle_base" into base
    from (
      select "platform"."handle_slug"(q."involvementFirstName")
               || left("platform"."handle_slug"(coalesce(q."involvementLastName", q."legalLastName")), 1)
               as "handle_base"
        from "platform"."profile" q
       where q."userId" = uid
    ) p
   where "platform"."handle_is_valid"(p."handle_base");

  if base is null then
    select c.handle into base
      from "platform"."handle_candidates"(uid) c
     where c.kind in ('preferred_full', 'legal_full', 'legal_initial', 'preferred_initial')
     order by c.ord
     limit 1;
  end if;

  return query
    select c.kind, c.handle, c.available
      from "platform"."handle_candidates"(uid) c
     order by c.ord;

  suffixed := "platform"."handle_suffixed"(uid, base);
  if suffixed is not null then
    return query select 'suffixed'::text, suffixed, true;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."handle_options"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."handle_options"(uuid) FROM PUBLIC;
