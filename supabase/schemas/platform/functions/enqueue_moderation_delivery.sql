CREATE OR REPLACE FUNCTION platform.enqueue_moderation_delivery (
  p_app    uuid,
  p_type   text,
  p_data   jsonb,
  p_report uuid  DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  new_id    uuid := gen_random_uuid();
  client_id uuid;
  endpoint  text;
  failure   text;
begin
  select mc."clientId", mc."endpointUrl" into client_id, endpoint
  from "platform"."moderationClients" mc
  where mc."appId" = p_app;

  if client_id is null then
    failure := 'No OAuth client is registered for this app';
  elsif endpoint is null then
    failure := 'The app''s client has no endpoint URL';
  end if;

  insert into "platform"."moderationDeliveries" (
    "id", "appId", "clientId", "reportId", "type", "payload", "status", "lastError"
  ) values (
    new_id, p_app, client_id, p_report, p_type,
    jsonb_build_object(
      'type', p_type,
      -- The decision's own time, shared by every delivery of one decision: the
      -- receiver orders by it.
      'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'data', p_data
    ),
    case when failure is null then 'pending' else 'failed' end::"platform"."deliveryStatus",
    failure
  );

  return new_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."enqueue_moderation_delivery"(uuid, text, jsonb, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."enqueue_moderation_delivery"(uuid, text, jsonb, uuid) FROM PUBLIC;
