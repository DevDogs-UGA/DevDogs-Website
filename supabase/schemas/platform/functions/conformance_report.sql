CREATE OR REPLACE FUNCTION platform.conformance_report (
  app_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app     record;
  ct      record;
  results jsonb := '[]'::jsonb;
  checks  jsonb;
  rel     regclass;
  sample  text;
  resolved jsonb;
  ok      boolean;
  detail  text;
  effect  "platform"."quarantineEffect";
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  for ct in
    select * from "platform".content_types() c where c."appId" = app."id"
    order by c."contentType"
  loop
    checks := '[]'::jsonb;
    rel := (quote_ident(ct."schemaName") || '.' || quote_ident(ct."tableName"))::regclass;

    -- Read straight from the override table rather than through
    -- content_types(): adding a column to a `returns table` signature means
    -- dropping and recreating it, and every function that calls it, for a value
    -- only this check consults.
    select coalesce(o."quarantineEffect", 'hide')
      into effect
      from "platform"."contentTypes" o
     where o."appId" = ct."appId" and o."tableName" = ct."tableName";
    effect := coalesce(effect, 'hide');

    -- 1. Addressable
    checks := checks || jsonb_build_object(
      'name', 'ref_column',
      'ok', ct."refColumn" is not null,
      'detail', coalesce(
        'Rows are addressed by "' || ct."refColumn" || '".',
        'No single-column primary key, so a content reference cannot name a row.'
      )
    );

    -- 2. Attributable
    checks := checks || jsonb_build_object(
      'name', 'author_column',
      'ok', ct."authorColumn" is not null,
      'detail', coalesce(
        'Reports will be filed against "' || ct."authorColumn" || '".',
        'No unambiguous foreign key to auth.users. Set "authorColumn" in platform."contentTypes".'
      )
    );

    -- 3. Resolvable -- against a real row, if there is one.
    ok := false;
    detail := null;
    if ct."refColumn" is not null and ct."authorColumn" is not null then
      begin
        execute "pg_catalog".format(
          'select t.%I::text from %I.%I t limit 1',
          ct."refColumn", ct."schemaName", ct."tableName"
        ) into sample;

        if sample is null then
          detail := 'No rows to test against. Seed some content and run this again.';
        else
          resolved := "platform".resolve_content(app_slug, ct."contentType", sample);
          ok := resolved is not null;
          detail := case
            when ok then 'Resolved a sample row, snapshotting ' ||
                         coalesce(array_length(ct."snapshotColumns", 1), 0)::text ||
                         ' column(s).'
            else 'resolve_content() found no row for a reference taken from the table itself.'
          end;
        end if;
      exception when others then
        detail := 'resolve_content() raised: ' || sqlerrm;
      end;
    else
      detail := 'Skipped: the type is not addressable or not attributable.';
    end if;
    checks := checks || jsonb_build_object(
      'name', 'resolve', 'ok', ok, 'detail', detail
    );

    -- 4/5. Quarantine, and whether clients can tamper with it.
    if ct."quarantineColumn" is null then
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Not quarantinable. Reports resolve by acting on the user instead.'
      );
    else
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Quarantine ' || effect::text || 's, writing to "' ||
                  ct."quarantineColumn" || '".'
      );

      ok := not (
        "pg_catalog".has_column_privilege('authenticated', rel, ct."quarantineColumn", 'UPDATE')
        or "pg_catalog".has_column_privilege('anon', rel, ct."quarantineColumn", 'UPDATE')
      );
      checks := checks || jsonb_build_object(
        'name', 'quarantine_protected',
        'ok', ok,
        'detail', case when ok
          then 'Clients cannot write "' || ct."quarantineColumn" || '".'
          else 'Clients CAN write "' || ct."quarantineColumn" ||
               '", so an author can un-hide their own content. Column-level REVOKE does not ' ||
               'override a table-wide UPDATE grant -- revoke UPDATE on the table, then grant it back per column.'
        end
      );

      -- The effect-dependent half. Both are heuristics over policy text, and
      -- both are the same heuristic pointed at a different command: whichever
      -- policy is supposed to ACT on the column had better mention it.
      if effect = 'hide' then
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('r', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'read_policy_filters_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'A read policy references "' || ct."quarantineColumn" || '".'
            else 'No read policy mentions "' || ct."quarantineColumn" ||
                 '". Quarantined content would stay visible: the platform sets the column, ' ||
                 'but only your policies can act on it. If quarantine is meant to freeze ' ||
                 'rather than hide this type, say so with "quarantineEffect" in platform."contentTypes".'
          end
        );
      else
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('w', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'write_policy_freezes_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'An update policy references "' || ct."quarantineColumn" ||
                 '", so a quarantined row stops being editable.'
            else 'This type declares quarantineEffect = ''freeze'', but no update policy mentions "' ||
                 ct."quarantineColumn" || '". The author could edit the content straight back, ' ||
                 'and rewrite the evidence a moderator is looking at.'
          end
        );
      end if;
    end if;

    -- 6. Heuristic: do write policies consult the cross-app ban?
    ok := exists (
      select 1 from "pg_catalog".pg_policy p
      where p.polrelid = rel
        and p.polcmd in ('a', 'w', '*')
        and coalesce(
          "pg_catalog".pg_get_expr(p.polwithcheck, p.polrelid), ''
        ) || coalesce(
          "pg_catalog".pg_get_expr(p.polqual, p.polrelid), ''
        ) like '%is_suspended%'
    );
    checks := checks || jsonb_build_object(
      'name', 'write_policy_checks_suspension',
      'ok', ok,
      'detail', case when ok
        then 'Write policies call platform.is_suspended().'
        else 'No write policy calls platform.is_suspended(), so a DevDogs suspension will not stop writes here.'
      end
    );

    results := results || jsonb_build_object(
      'contentType', ct."contentType",
      'tableName', ct."schemaName" || '.' || ct."tableName",
      'checks', checks
    );
  end loop;

  return results;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."conformance_report"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."conformance_report"(text) FROM PUBLIC;
