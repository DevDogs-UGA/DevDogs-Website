CREATE OR REPLACE FUNCTION platform.dismiss_report_as (
  actor          uuid,
  report_id      uuid,
  moderator_note text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- A dismissal is a resolution in which nothing happens to anyone, so it is
  -- the same code path rather than a parallel one. The distinction a user sees
  -- -- 'dismissed' rather than 'resolved' -- is applied afterwards, inside the
  -- same transaction.
  perform "platform".resolve_report_as(
    actor, report_id, 'no_action', 'no_action', 'no_action', moderator_note, false
  );

  update "platform"."reports"
  set "status" = 'dismissed'
  where "id" = report_id;

  return jsonb_build_object('dismissed', true);
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."dismiss_report_as"(uuid, uuid, text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."dismiss_report_as"(uuid, uuid, text) FROM PUBLIC;
