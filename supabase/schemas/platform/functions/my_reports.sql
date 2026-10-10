CREATE OR REPLACE FUNCTION platform.my_reports (
  app_slug  text                        DEFAULT NULL::text,
  since     timestamp without time zone DEFAULT NULL::timestamp WITHOUT time zone,
  only_open boolean                     DEFAULT NULL::boolean
)
  RETURNS TABLE (
    "reportId"       uuid,
    "appSlug"        text,
    "contentType"    text,
    "contentRef"     text,
    "contentUrl"     text,
    snapshot         text,
    reason           platform."reportReason",
    description      text,
    status           platform."reportStatus",
    "createdAt"      timestamp without time zone,
    "resolvedAt"     timestamp without time zone,
    outcome          text,
    "contentRemoved" boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    r."id",
    a."slug",
    r."contentType",
    r."contentRef",
    r."contentUrl",
    -- Withheld unless the type is marked public. A type that has since been
    -- dropped resolves to no row at all, so `c."visibility"` is null and this
    -- withholds too -- which is the safe direction.
    case when c."visibility" = 'public' then r."contentSnapshot"::text end,
    r."reason",
    r."description"::text,
    r."status",
    r."createdAt",
    r."resolvedAt",
    -- Deliberately coarse. A reporter never learns what happened to the other
    -- user; that is not their business, and the console has the full record.
    case
      when r."status" = 'open' then null
      when r."status" = 'dismissed' then 'dismissed'
      when res."subjectAction" <> 'no_action'
        or res."contentAction" <> 'no_action' then 'action_taken'
      else 'no_violation'
    end,
    coalesce(res."contentAction" = 'quarantine', false)
  from "platform"."reports" r
  join "platform"."apps" a on a."id" = r."appId"
  left join "platform"."reportResolutions" res on res."reportId" = r."id"
  left join "platform".content_types() c
    on c."appId" = r."appId" and c."contentType" = r."contentType"
  where r."reporterUserId" = (select auth.uid())
    and (app_slug is null or a."slug" = app_slug)
    and (only_open is null
         or (only_open and r."status" = 'open')
         or (not only_open and r."status" <> 'open'))
    and (since is null or r."resolvedAt" > since)
  order by r."createdAt" desc;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."my_reports"(text, timestamp WITHOUT time zone, boolean) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."my_reports"(text, timestamp WITHOUT time zone, boolean) FROM PUBLIC;
