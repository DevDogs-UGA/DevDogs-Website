CREATE OR REPLACE FUNCTION platform.file_external_report (
  p_app          uuid,
  p_reporter     uuid,
  p_author       uuid,
  p_content_type text,
  p_content_ref  text,
  p_snapshot     text,
  p_url          text,
  p_reason       platform."reportReason",
  p_description  text                    DEFAULT NULL::text
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
  max_per_hour constant integer := 10;
  existing uuid;
  recent   integer;
  new_id   uuid;
begin
  if not exists (
    select 1 from "platform"."apps" a where a."id" = p_app and a."kind" = 'external'
  ) then
    raise exception 'moderation:unknown_client';
  end if;
  if not exists (
    select 1 from "platform"."externalContentTypes" t
    where t."appId" = p_app and t."contentType" = p_content_type
  ) then
    raise exception 'moderation:unknown_content_type';
  end if;
  if not exists (select 1 from auth.users u where u."id" = p_reporter)
     or not exists (select 1 from auth.users u where u."id" = p_author) then
    raise exception 'moderation:unknown_user';
  end if;
  if "platform".is_suspended(p_reporter) or "platform".is_test_identity(p_reporter) then
    raise exception 'moderation:reporter_not_allowed';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_description), '') = '' then
    raise exception 'moderation:invalid_request';
  end if;

  select count(*) into recent
  from "platform"."reports" r
  where r."reporterUserId" = p_reporter
    and r."createdAt" > now() - interval '1 hour';
  if recent >= max_per_hour then
    raise exception 'moderation:rate_limited';
  end if;

  select r."id" into existing
  from "platform"."reports" r
  where r."appId" = p_app
    and r."contentType" = p_content_type
    and r."contentRef" = p_content_ref
    and r."status" = 'open';

  if found then
    -- The report's own reporter sending it again (a retry, a replay) adds
    -- nothing: a corroboration is a second person agreeing.
    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    select existing, p_reporter, p_reason, left(p_description, 1000)
    where not exists (
      select 1 from "platform"."reports" r
      where r."id" = existing and r."reporterUserId" = p_reporter
    )
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
      p_app, p_reporter, p_author,
      p_content_type, p_content_ref,
      left(p_snapshot, 5000), p_url,
      left(p_description, 1000), p_reason
    ) returning "id" into new_id;
  exception when unique_violation then
    -- Two reporters raced on the same content: the partial unique index caught
    -- the second one, which becomes a corroboration.
    select r."id" into existing
    from "platform"."reports" r
    where r."appId" = p_app
      and r."contentType" = p_content_type
      and r."contentRef" = p_content_ref
      and r."status" = 'open';

    -- The report's own reporter sending it again (a retry, a replay) adds
    -- nothing: a corroboration is a second person agreeing.
    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    select existing, p_reporter, p_reason, left(p_description, 1000)
    where not exists (
      select 1 from "platform"."reports" r
      where r."id" = existing and r."reporterUserId" = p_reporter
    )
    on conflict on constraint "reportCorroborations_report_reporter_key" do nothing;
    return query select existing, true;
    return;
  end;

  return query select new_id, false;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."file_external_report"(uuid, uuid, uuid, text, text, text, text, platform."reportReason", text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."file_external_report"(uuid, uuid, uuid, text, text, text, text, platform."reportReason", text) FROM PUBLIC;
