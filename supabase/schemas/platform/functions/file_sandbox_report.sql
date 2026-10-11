CREATE OR REPLACE FUNCTION platform.file_sandbox_report (
  p_client       uuid,
  p_reporter     uuid,
  p_author       uuid,
  p_content_type text,
  p_content_ref  text,
  p_snapshot     text,
  p_url          text,
  p_reason       platform."reportReason",
  p_description  text                    DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  max_per_hour constant integer := 30;
  recent integer;
  new_id uuid;
begin
  if not exists (select 1 from auth.users u where u."id" = p_reporter)
     or not exists (select 1 from auth.users u where u."id" = p_author) then
    raise exception 'moderation:unknown_user';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_description), '') = '' then
    raise exception 'moderation:invalid_request';
  end if;

  select count(*) into recent
  from "platform"."sandboxReports" s
  where s."clientId" = p_client
    and s."createdAt" > now() - interval '1 hour';
  if recent >= max_per_hour then
    raise exception 'moderation:rate_limited';
  end if;

  insert into "platform"."sandboxReports" (
    "clientId", "reporterUserId", "authorUserId", "contentType", "contentRef",
    "contentSnapshot", "contentUrl", "description", "reason"
  ) values (
    p_client, p_reporter, p_author, p_content_type, p_content_ref,
    left(p_snapshot, 5000), p_url, left(p_description, 1000), p_reason
  ) returning "id" into new_id;

  return new_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."file_sandbox_report"(uuid, uuid, uuid, text, text, text, text, platform."reportReason", text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."file_sandbox_report"(uuid, uuid, uuid, text, text, text, text, platform."reportReason", text) FROM PUBLIC;
