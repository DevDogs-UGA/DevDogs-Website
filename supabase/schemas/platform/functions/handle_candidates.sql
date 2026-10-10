CREATE OR REPLACE FUNCTION platform.handle_candidates (
  uid uuid
)
  RETURNS TABLE (
    ord       integer,
    kind      text,
    handle    text,
    available boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    c.ord,
    c.kind,
    c.handle,
    not exists (
      select 1 from "platform"."profile" other
      where other."handle" = c.handle and other."userId" <> uid
    )
  from (
    select distinct on (raw.handle) raw.ord, raw.kind, raw.handle
    from (
      select 1 as ord, 'github' as kind,
             lower(i.identity_data ->> 'user_name') as handle
        from auth.identities i
       where i.user_id = uid and i.provider = 'github'
      union all
      select 2, 'discord', lower(i.identity_data ->> 'full_name')
        from auth.identities i
       where i.user_id = uid and i.provider = 'discord'
      union all
      select 3, 'myid', lower(split_part(p."ugaEmail", '@', 1))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 4, 'legal_full',
             "platform"."handle_slug"(p."legalFirstName")
               || "platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName"))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 5, 'legal_initial',
             "platform"."handle_slug"(p."legalFirstName")
               || left("platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")), 1)
        from "platform"."profile" p where p."userId" = uid
      union all
      select 6, 'preferred_full',
             "platform"."handle_slug"(p."involvementFirstName")
               || "platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName"))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 7, 'preferred_initial',
             "platform"."handle_slug"(p."involvementFirstName")
               || left("platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")), 1)
        from "platform"."profile" p where p."userId" = uid
    ) raw
    where "platform"."handle_is_valid"(raw.handle)
    order by raw.handle, raw.ord
  ) c
  order by c.ord;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."handle_candidates"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."handle_candidates"(uuid) FROM PUBLIC;
