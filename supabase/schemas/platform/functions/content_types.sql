CREATE OR REPLACE FUNCTION platform.content_types()
  RETURNS TABLE (
    "appId"            uuid,
    "appSlug"          text,
    "schemaName"       text,
    "tableName"        text,
    "contentType"      text,
    label              text,
    "refColumn"        text,
    "authorColumn"     text,
    "snapshotColumns"  text[],
    "urlTemplate"      text,
    visibility         platform."contentVisibility",
    "quarantineColumn" text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with app_tables as (
  select
    a."id"          as app_id,
    a."slug"        as app_slug,
    a."schemaName"  as schema_name,
    c.oid           as rel_oid,
    c.relname::text as table_name
  from "platform"."apps" a
  join pg_catalog.pg_namespace n on n.nspname = a."schemaName"
  join pg_catalog.pg_class c
    on c.relnamespace = n.oid and c.relkind in ('r', 'p')
),
-- The column holding the FK to reportResolutions. Its presence is the
-- registration, and its name is where apply_content_action writes.
quarantine_col as (
  select t.rel_oid, att.attname::text as col
  from app_tables t
  join pg_catalog.pg_constraint fk
    on fk.conrelid = t.rel_oid
   and fk.contype = 'f'
   and fk.confrelid = '"platform"."reportResolutions"'::regclass
   and array_length(fk.conkey, 1) = 1
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid and att.attnum = fk.conkey[1]
),
-- The single-column primary key, which is what a contentRef addresses. A
-- composite key produces no row, so "refColumn" is null and the type reports as
-- unresolvable rather than silently disappearing.
ref_col as (
  select t.rel_oid, att.attname::text as col
  from app_tables t
  join pg_catalog.pg_constraint pk
    on pk.conrelid = t.rel_oid
   and pk.contype = 'p'
   and array_length(pk.conkey, 1) = 1
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid and att.attnum = pk.conkey[1]
),
-- The table's foreign key to auth.users. `having count(*) = 1` is the point:
-- two such keys are ambiguous, so nothing is derived and "authorColumn" must be
-- set explicitly rather than guessed at.
author_col as (
  select rel_oid, min(col) as col
  from (
    select t.rel_oid, att.attname::text as col
    from app_tables t
    join pg_catalog.pg_constraint fk
      on fk.conrelid = t.rel_oid
     and fk.contype = 'f'
     and fk.confrelid = 'auth.users'::regclass
     and array_length(fk.conkey, 1) = 1
    join pg_catalog.pg_attribute att
      on att.attrelid = t.rel_oid and att.attnum = fk.conkey[1]
  ) s
  group by rel_oid
  having count(*) = 1
),
text_cols as (
  select t.rel_oid, array_agg(att.attname::text order by att.attnum) as cols
  from app_tables t
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid
   and att.attnum > 0
   and not att.attisdropped
   and att.atttypid in ('pg_catalog.text'::regtype, 'pg_catalog.varchar'::regtype)
  group by t.rel_oid
)
select
  t.app_id,
  t.app_slug,
  t.schema_name,
  t.table_name,
  coalesce(o."contentType", t.table_name),
  coalesce(o."label", initcap(replace(t.table_name, '_', ' '))),
  r.col,
  coalesce(o."authorColumn", au.col),
  coalesce(o."snapshotColumns", tc.cols, '{}'::text[]),
  o."urlTemplate",
  coalesce(o."visibility", 'restricted'::"platform"."contentVisibility"),
  q.col
from app_tables t
left join "platform"."contentTypes" o
  on o."appId" = t.app_id and o."tableName" = t.table_name
left join quarantine_col q  on q.rel_oid  = t.rel_oid
left join ref_col        r  on r.rel_oid  = t.rel_oid
left join author_col     au on au.rel_oid = t.rel_oid
left join text_cols      tc on tc.rel_oid = t.rel_oid
where q.col is not null or o."id" is not null;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."content_types"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."content_types"() FROM PUBLIC;
