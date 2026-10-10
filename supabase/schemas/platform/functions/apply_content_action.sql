CREATE OR REPLACE FUNCTION platform.apply_content_action (
  app_slug      text,
  content_type  text,
  content_ref   text,
  action        platform."contentAction",
  resolution_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app      record;
  ct       record;
  actioner regprocedure;
  affected integer;
begin
  if action = 'no_action' then
    return;
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  -- The escape hatch for a quarantine that means something non-trivial:
  -- cascading from a resource to its comments, or a soft-delete spanning
  -- tables. Contract:
  -- (content_type text, content_ref text, action platform."contentAction", resolution_id uuid).
  if app."contentActioner" is not null then
    actioner := to_regprocedure(app."contentActioner");
    if actioner is null then
      raise exception
        'App "%" names a contentActioner that does not exist: %',
        app_slug, app."contentActioner";
    end if;
    execute format('select %s($1, $2, $3, $4)', actioner::regproc)
      using content_type, content_ref, action, resolution_id;
    return;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  if ct."quarantineColumn" is null then
    raise exception
      'Content type "%" in app "%" cannot be quarantined: "%"."%" has no foreign key to platform."reportResolutions". Add one, or resolve with a different content action.',
      content_type, app_slug, ct."schemaName", ct."tableName";
  end if;
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;

  execute format(
    'update %I.%I set %I = $1 where %I::text = $2',
    ct."schemaName", ct."tableName", ct."quarantineColumn", ct."refColumn"
  ) using resolution_id, content_ref;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception
      'No % with reference % exists in app "%"; nothing was quarantined',
      content_type, content_ref, app_slug;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."apply_content_action"(text, text, text, platform."contentAction", uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."apply_content_action"(text, text, text, platform."contentAction", uuid) FROM PUBLIC;
