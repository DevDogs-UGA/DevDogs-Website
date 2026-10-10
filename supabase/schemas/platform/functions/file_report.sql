CREATE OR REPLACE FUNCTION platform.file_report (
  app_slug     text,
  content_type text,
  content_ref  text,
  reason       platform."reportReason",
  description  text                    DEFAULT NULL::text
)
  RETURNS TABLE (
    "reportId"   uuid,
    corroborated boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  -- Generous enough that no honest reporter reaches it, low enough that a
  -- script cannot bury the queue.
  max_per_hour constant integer := 10;
  caller   uuid := (select auth.uid());
  app      record;
  content  jsonb;
  existing uuid;
  recent   integer;
  new_id   uuid;
begin
  if caller is null then
    raise exception 'file_report() requires an authenticated session';
  end if;
  if "platform".is_suspended(caller) then
    raise exception 'Suspended accounts cannot file reports';
  end if;
  if "platform".is_test_identity(caller) then
    raise exception 'Test identities cannot file reports';
  end if;

  if reason = 'other' and coalesce(btrim(description), '') = '' then
    raise exception 'A description is required when the reason is "other"';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  select count(*) into recent
  from "platform"."reports" r
  where r."reporterUserId" = caller
    and r."createdAt" > now() - interval '1 hour';

  if recent >= max_per_hour then
    raise exception 'Too many reports filed in the last hour';
  end if;

  content := "platform".resolve_content(app_slug, content_type, content_ref);
  if content is null then
    raise exception
      'No % with reference % exists in app "%"', content_type, content_ref, app_slug;
  end if;

  select r."id" into existing
  from "platform"."reports" r
  where r."appId" = app."id"
    and r."contentType" = content_type
    and r."contentRef" = content_ref
    and r."status" = 'open';

  if found then
    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    values (existing, caller, reason, left(description, 1000))
    -- Named constraint rather than `on conflict ("reportId", ...)`: with a
    -- `returns table` signature, "reportId" is also an OUT parameter, and a
    -- parenthesised conflict target is resolved against BOTH namespaces --
    -- "column reference is ambiguous", raised at runtime only on this path.
    -- The INSERT column list above is safe (never substituted).
    --
    -- 20260807000000 promoted the (reportId, reporterUserId) unique INDEX to a
    -- real CONSTRAINT so it can be named here. Before that this said
    -- "reportCorroborations_pkey", which is on a defaulted uuid and therefore
    -- never conflicted -- so a second report of the same content by the same
    -- person raised an unhandled unique_violation instead of being swallowed.
    on conflict on constraint "reportCorroborations_report_reporter_key" do nothing;
    return query select existing, true;
    return;
  end if;

  begin
    insert into "platform"."reports" (
      "appId", "reporterUserId", "reportedUserId",
      "contentType", "contentRef", "contentSnapshot", "contentUrl",
      "description", "reason"
    ) values (
      app."id", caller, (content ->> 'authorUserId')::uuid,
      content_type, content_ref,
      coalesce(content ->> 'snapshot', ''), content ->> 'url',
      left(description, 1000), reason
    ) returning "id" into new_id;
  exception when unique_violation then
    -- Two reporters raced on the same content: the partial unique index caught
    -- the second one, which becomes a corroboration like any other.
    select r."id" into existing
    from "platform"."reports" r
    where r."appId" = app."id"
      and r."contentType" = content_type
      and r."contentRef" = content_ref
      and r."status" = 'open';

    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    values (existing, caller, reason, left(description, 1000))
    on conflict on constraint "reportCorroborations_report_reporter_key" do nothing;
    return query select existing, true;
    return;
  end;

  return query select new_id, false;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."file_report"(text, text, text, platform."reportReason", text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."file_report"(text, text, text, platform."reportReason", text) FROM PUBLIC;
