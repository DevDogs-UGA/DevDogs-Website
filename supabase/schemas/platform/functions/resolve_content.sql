CREATE OR REPLACE FUNCTION platform.resolve_content (
  app_slug     text,
  content_type text,
  content_ref  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app        record;
  ct         record;
  resolver   regprocedure;
  result     jsonb;
  snap_expr  text;
  row_found  boolean;
  author_id  uuid;
  snapshot   text;
begin
  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  if app."contentResolver" is not null then
    -- Resolved from its text signature at call time rather than held as a
    -- regprocedure column, because an OID goes stale the moment the function is
    -- dropped and recreated and does not survive dump/restore.
    resolver := to_regprocedure(app."contentResolver");
    if resolver is null then
      raise exception
        'App "%" names a contentResolver that does not exist: %',
        app_slug, app."contentResolver";
    end if;
    execute format('select %s($1, $2)', resolver::regproc)
      into result using content_type, content_ref;
    return result;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  -- Derivation returns misconfigured types rather than hiding them, so these
  -- are the two ways a type can exist but be unusable.
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;
  if ct."authorColumn" is null then
    raise exception
      'Content type "%" in app "%" has no unambiguous foreign key to auth.users; set "authorColumn" in platform."contentTypes"',
      content_type, app_slug;
  end if;

  -- Identifiers only, quoted with %I. The validation trigger on
  -- platform."contentTypes" already refused any name that is not a real column,
  -- so this cannot be reached with an expression in it.
  select string_agg(format('t.%I::text', col), ', ' order by ord)
    into snap_expr
    from unnest(ct."snapshotColumns") with ordinality as u(col, ord);

  execute format(
    'select true, t.%I::text, left(concat_ws(%L, %s), 5000) from %I.%I t where t.%I::text = $1',
    ct."authorColumn",
    E'\n\n',
    coalesce(snap_expr, 'null'),
    ct."schemaName", ct."tableName", ct."refColumn"
  ) into row_found, author_id, snapshot using content_ref;

  if not coalesce(row_found, false) then
    return null;
  end if;

  return jsonb_build_object(
    'appId',         app."id",
    'appSlug',       app_slug,
    'contentType',   ct."contentType",
    'contentRef',    content_ref,
    'label',         ct."label",
    'authorUserId',  author_id,
    'snapshot',      snapshot,
    'url',           case
                       when ct."urlTemplate" is not null
                       then replace(ct."urlTemplate", '{ref}', content_ref)
                     end,
    'visibility',    ct."visibility",
    'quarantinable', ct."quarantineColumn" is not null
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."resolve_content"(text, text, text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."resolve_content"(text, text, text) FROM PUBLIC;
