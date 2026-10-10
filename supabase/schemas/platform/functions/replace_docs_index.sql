CREATE OR REPLACE FUNCTION platform.replace_docs_index (
  pages jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  new_hash text;
  page_count integer;
begin
  if jsonb_typeof(pages) is distinct from 'array' then
    raise exception 'replace_docs_index: pages must be a json array';
  end if;

  page_count := jsonb_array_length(pages);
  if page_count = 0 then
    raise exception 'replace_docs_index: refusing to replace the index with no pages';
  end if;

  -- jsonb text is canonical (sorted keys, normalized whitespace), so the same
  -- pages always hash the same however the client serialized them.
  new_hash := encode(sha256(convert_to(pages::text, 'UTF8')), 'hex');

  if exists (select 1 from "platform"."docsIndexState" where "hash" = new_hash)
     and (select count(*) from "platform"."docsPages") = page_count then
    return false;
  end if;

  insert into "platform"."docsPages" ("path", "title", "description", "plainText", "publishAt")
  select p."path", p."title", p."description", p."plainText", p."publishAt"
  from jsonb_to_recordset(pages) as p(
    "path" text,
    "title" text,
    "description" text,
    "plainText" text,
    "publishAt" timestamp with time zone
  )
  on conflict ("path") do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "plainText" = excluded."plainText",
    "publishAt" = excluded."publishAt",
    "updatedAt" = now()
  where ("docsPages"."title", "docsPages"."description", "docsPages"."plainText", "docsPages"."publishAt")
    is distinct from (excluded."title", excluded."description", excluded."plainText", excluded."publishAt");

  delete from "platform"."docsPages"
  where "path" not in (
    select p."path" from jsonb_to_recordset(pages) as p("path" text)
  );

  insert into "platform"."docsIndexState" ("id", "hash")
  values (true, new_hash)
  on conflict ("id") do update set "hash" = excluded."hash", "updatedAt" = now();

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."replace_docs_index"(jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."replace_docs_index"(jsonb) FROM PUBLIC;
