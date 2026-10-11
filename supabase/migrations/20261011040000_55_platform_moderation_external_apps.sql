-- Moderation for apps outside the platform database (lane 3d).
--
-- Migrations 22-26 reach into an app's own tables: `resolve_content` reads the
-- reported row, `apply_content_action` writes `quarantinedBy`. That only works
-- while the app lives in this database. DogPack has its own Supabase project, so
-- the registry gains a second kind of app, and the dispatcher sends a signed
-- message instead of running SQL.
--
--   internal  (existing)  schemaName set, content types DERIVED from foreign keys
--   external  (new)       no schema; content types DECLARED in
--                         platform."externalContentTypes"; reports arrive over
--                         HTTPS; decisions leave as platform."moderationDeliveries"
--
-- A decision and its deliveries are written in ONE transaction by
-- `resolve_report_as`, so a delivery exists if and only if the decision does.
-- The Worker queues them after the commit and a cron re-queues any that never
-- reached the queue.
--
-- Development clients never reach moderators: a report signed by a client that
-- is not registered to an external app lands in platform."sandboxReports", which
-- only the client's owner can read, on /tools/oauth.

create type "platform"."appKind" as enum ('internal', 'external');
grant usage on type "platform"."appKind" to "postgres";

create type "platform"."deliveryStatus" as enum ('pending', 'delivered', 'failed');
grant usage on type "platform"."deliveryStatus" to "postgres";

-- ── apps ─────────────────────────────────────────────────────────────────────

alter table "platform"."apps"
  add column "kind" "platform"."appKind" not null default 'internal';

alter table "platform"."apps"
  alter column "schemaName" drop not null;

-- An external app has no schema and none of the in-database escape hatches.
alter table "platform"."apps"
  add constraint "apps_kind_shape_check" check (
    ("kind" = 'internal' and "schemaName" is not null)
    or ("kind" = 'external'
        and "schemaName" is null
        and "contentResolver" is null
        and "contentActioner" is null)
  );

create or replace function platform.validate_app_schema()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  -- External apps have no schema to check; the table's check constraint is what
  -- keeps a null schema from reaching an internal app.
  if new."schemaName" is null then
    return new;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_namespace where nspname = new."schemaName"
  ) then
    raise exception 'platform.apps: schema "%" does not exist', new."schemaName";
  end if;
  return new;
end;
$function$;

-- ── The clients that can sign for moderation ─────────────────────────────────

-- One row per OAuth client that has turned moderation on. The signing secret is
-- not stored: it is derived from the Worker's MODERATION_SIGNING_KEY, the client
-- id and "secretVersion", so rotating is incrementing the version and a database
-- dump holds nothing that signs.
--
-- "appId" is what separates the two worlds. Set (by an officer, through
-- register_external_app), the client is a production app and its reports reach
-- moderators. Null, it is a development client and its reports are a sandbox.
create table "platform"."moderationClients" (
  "clientId"      uuid        not null,
  "appId"         uuid,
  -- Where decisions are delivered. https only: a delivery carries a user id.
  "endpointUrl"   text,
  "secretVersion" integer     not null default 1,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),
  constraint "moderationClients_pkey" primary key ("clientId"),
  constraint "moderationClients_appId_key" unique ("appId"),
  constraint "moderationClients_clientId_fkey"
    foreign key ("clientId") references auth.oauth_clients(id)
    on update cascade on delete cascade,
  constraint "moderationClients_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete set null,
  constraint "moderationClients_endpoint_https_check"
    check ("endpointUrl" is null or "endpointUrl" ~ '^https://[^[:space:]]+$'),
  constraint "moderationClients_secretVersion_check" check ("secretVersion" >= 1)
);

alter table "platform"."moderationClients" enable row level security;
revoke all on table "platform"."moderationClients" from "anon", "authenticated";
grant all on table "platform"."moderationClients" to "postgres", "service_role";

-- The content types an external app may report, declared instead of derived.
create table "platform"."externalContentTypes" (
  "appId"       uuid not null,
  "contentType" text not null,
  "label"       text not null,
  "urlTemplate" text,
  constraint "externalContentTypes_pkey" primary key ("appId", "contentType"),
  constraint "externalContentTypes_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete cascade,
  constraint "externalContentTypes_contentType_check"
    check ("contentType" ~ '^[a-z][a-z0-9_]{0,62}$')
);

alter table "platform"."externalContentTypes" enable row level security;
revoke all on table "platform"."externalContentTypes" from "anon", "authenticated";
grant all on table "platform"."externalContentTypes" to "postgres", "service_role";

-- ── Reports from development clients ─────────────────────────────────────────

create table "platform"."sandboxReports" (
  "id"              uuid          not null default gen_random_uuid(),
  "clientId"        uuid          not null,
  "reporterUserId"  uuid          not null,
  "authorUserId"    uuid          not null,
  "contentType"     text          not null,
  "contentRef"      text          not null,
  "contentSnapshot" varchar(5000) not null,
  "contentUrl"      text,
  "description"     varchar(1000),
  "reason"          "platform"."reportReason" not null,
  "createdAt"       timestamptz   not null default now(),
  constraint "sandboxReports_pkey" primary key ("id"),
  constraint "sandboxReports_clientId_fkey"
    foreign key ("clientId") references auth.oauth_clients(id) on delete cascade,
  constraint "sandboxReports_reporterUserId_fkey"
    foreign key ("reporterUserId") references auth.users(id) on delete cascade,
  constraint "sandboxReports_authorUserId_fkey"
    foreign key ("authorUserId") references auth.users(id) on delete cascade
);

create index "sandboxReports_client_idx"
  on "platform"."sandboxReports" ("clientId", "createdAt" desc);

alter table "platform"."sandboxReports" enable row level security;
revoke all on table "platform"."sandboxReports" from "anon", "authenticated";
grant all on table "platform"."sandboxReports" to "postgres", "service_role";

-- ── Deliveries ───────────────────────────────────────────────────────────────

-- One row per signed message owed to an app. "id" is the Standard Webhooks
-- message id (`msg_<id>`), so a resend is a replay the receiver ignores.
create table "platform"."moderationDeliveries" (
  "id"            uuid                       not null default gen_random_uuid(),
  "appId"         uuid,
  "clientId"      uuid,
  "reportId"      uuid,
  "type"          text                       not null,
  -- The exact message body, frozen when the decision was made.
  "payload"       jsonb                      not null,
  "status"        "platform"."deliveryStatus" not null default 'pending',
  "attempts"      integer                    not null default 0,
  "lastError"     text,
  "lastAttemptAt" timestamptz,
  -- When it last went onto the queue; null means it never has.
  "queuedAt"      timestamptz,
  "deliveredAt"   timestamptz,
  "createdAt"     timestamptz                not null default now(),
  -- A sandbox delivery is a "Send test action" to a development client.
  "sandbox"       boolean                    not null default false,
  constraint "moderationDeliveries_pkey" primary key ("id"),
  constraint "moderationDeliveries_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete cascade,
  constraint "moderationDeliveries_clientId_fkey"
    foreign key ("clientId") references auth.oauth_clients(id) on delete set null,
  constraint "moderationDeliveries_reportId_fkey"
    foreign key ("reportId") references "platform"."reports"("id") on delete set null,
  constraint "moderationDeliveries_type_check" check (
    "type" in ('content.hide', 'content.remove', 'content.restore',
               'user.suspend', 'user.ban', 'user.restore')
  ),
  constraint "moderationDeliveries_target_check" check ("appId" is not null or "sandbox")
);

create index "moderationDeliveries_pending_idx"
  on "platform"."moderationDeliveries" ("queuedAt")
  where "status" = 'pending';

create index "moderationDeliveries_report_idx"
  on "platform"."moderationDeliveries" ("reportId");

create index "moderationDeliveries_client_idx"
  on "platform"."moderationDeliveries" ("clientId", "createdAt" desc);

alter table "platform"."moderationDeliveries" enable row level security;
revoke all on table "platform"."moderationDeliveries" from "anon", "authenticated";
grant all on table "platform"."moderationDeliveries" to "postgres", "service_role";

-- ── Delivery enqueueing ──────────────────────────────────────────────────────

-- Writes one pending delivery for `p_app`'s registered client. An app with no
-- client or no endpoint gets a FAILED row instead of a silent drop, so the
-- console shows it and a resend works once the registration is fixed.
create function platform.enqueue_moderation_delivery(
  p_app    uuid,
  p_type   text,
  p_data   jsonb,
  p_report uuid default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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

-- A user's standing changed. Delivered to every external app, or to `p_only_app`
-- alone for a decision scoped to one app. Internal apps are skipped: their
-- standing is the platform's own.
create function platform.enqueue_user_standing(
  p_user     uuid,
  p_action   text,
  p_reason   text,
  p_report   uuid default null,
  p_only_app uuid default null
)
  returns uuid[]
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  ids uuid[] := '{}';
  app record;
begin
  if p_action not in ('suspend', 'ban', 'restore') then
    raise exception 'Unknown user standing action "%"', p_action;
  end if;

  for app in
    select a."id"
    from "platform"."apps" a
    where a."kind" = 'external'
      and (p_only_app is null or a."id" = p_only_app)
    order by a."slug"
  loop
    ids := ids || "platform".enqueue_moderation_delivery(
      app."id",
      'user.' || p_action,
      jsonb_build_object('userId', p_user, 'reason', p_reason, 'reportId', p_report),
      p_report
    );
  end loop;

  return ids;
end;
$function$;

-- ── The decision ─────────────────────────────────────────────────────────────

-- resolve_report_as, with one branch added: an external app's content action
-- and the user standing changes become deliveries instead of in-database writes.
-- Everything else is migration 25's, unchanged.
create or replace function platform.resolve_report_as(
  actor          uuid,
  report_id      uuid,
  subject_action platform."subjectAction",
  filer_action   platform."filerAction",
  content_action platform."contentAction",
  moderator_note text    default null::text,
  apply_globally boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  report     record;
  app_slug   text;
  resolution uuid;
  external   boolean;
  reason_txt text;
  scope_app  uuid;
  deliveries uuid[] := '{}';
begin
  if actor is null then
    raise exception 'resolve_report() requires a moderator';
  end if;
  if not "platform".has_permission(actor, 'canModerate') then
    raise exception 'resolve_report() requires the canModerate permission';
  end if;

  select r.*, a."slug" as slug, a."kind" as app_kind into report
  from "platform"."reports" r
  join "platform"."apps" a on a."id" = r."appId"
  where r."id" = report_id;

  if not found then
    raise exception 'Report % does not exist', report_id;
  end if;
  if report."status" <> 'open' then
    raise exception 'Report % has already been decided', report_id;
  end if;
  app_slug := report.slug;
  external := report.app_kind = 'external';

  update "platform"."reports"
  set "status" = 'resolved', "resolvedAt" = now()
  where "id" = report_id;

  insert into "platform"."reportResolutions" (
    "reportId", "moderatorUserId", "subjectAction", "filerAction",
    "contentAction", "appliedGlobally", "moderatorNote"
  ) values (
    report_id, actor, subject_action, filer_action,
    content_action, coalesce(apply_globally, false), moderator_note
  ) returning "id" into resolution;

  if external then
    -- The app's rows are in another database: record the decision and owe the
    -- app a signed message. Quarantine is a hide; restore is a separate action.
    if content_action = 'quarantine' then
      deliveries := deliveries || "platform".enqueue_moderation_delivery(
        report."appId",
        'content.hide',
        jsonb_build_object(
          'contentType', report."contentType",
          'contentRef',  report."contentRef",
          'reportId',    report_id
        ),
        report_id
      );
    end if;
  else
    -- Inside the same transaction as the decision, and raises rather than
    -- no-oping, so a content action that cannot be applied aborts the whole
    -- resolution instead of recording an outcome that silently never landed.
    perform "platform".apply_content_action(
      app_slug, report."contentType", report."contentRef", content_action, resolution
    );
  end if;

  if coalesce(apply_globally, false) then
    if subject_action in ('suspend', 'ban') then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reportedUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;

    if filer_action = 'suspend' then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reporterUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;
  end if;

  -- Standing changes reach every external app when global, and the reported
  -- app alone otherwise. The reason is the report's category, never the
  -- moderator's private note.
  if (subject_action in ('suspend', 'ban') or filer_action = 'suspend')
     and (coalesce(apply_globally, false) or external) then
    reason_txt := report."reason"::text;
    scope_app := case when coalesce(apply_globally, false) then null else report."appId" end;

    if subject_action in ('suspend', 'ban') then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reportedUserId", subject_action::text, reason_txt, report_id, scope_app
      );
    end if;
    if filer_action = 'suspend' then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reporterUserId", 'suspend', reason_txt, report_id, scope_app
      );
    end if;
  end if;

  return jsonb_build_object(
    'resolutionId', resolution,
    -- Non-null only when Supabase's native ban still has to be applied by a
    -- caller with admin credentials.
    'bannedUserId', case
      when coalesce(apply_globally, false) and subject_action = 'ban'
      then report."reportedUserId"
    end,
    -- The deliveries this decision owes that are ready to send, for the caller
    -- to queue once the transaction has committed. One already marked failed
    -- (its app has no endpoint) waits for a person and a resend instead.
    'deliveryIds', (
      select coalesce(jsonb_agg(d."id" order by d."createdAt", d."id"), '[]'::jsonb)
      from "platform"."moderationDeliveries" d
      where d."id" = any(deliveries) and d."status" = 'pending'
    )
  );
end;
$function$;

-- ── The report API's writes ──────────────────────────────────────────────────

-- Errors the API maps to a response carry a `moderation:` prefix; anything else
-- is a bug and surfaces as a 500.

-- A report from a registered external app. The app vouches for both user ids
-- (the Worker has verified the request's signature); the checks that remain are
-- the platform's own: standing, rate, and whether the content type is declared.
create function platform.file_external_report(
  p_app          uuid,
  p_reporter     uuid,
  p_author       uuid,
  p_content_type text,
  p_content_ref  text,
  p_snapshot     text,
  p_url          text,
  p_reason       platform."reportReason",
  p_description  text default null
)
  returns table ("reportId" uuid, corroborated boolean)
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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

-- A report from a development client: recorded for its owner only. Test
-- identities may file these, which is what they exist for.
create function platform.file_sandbox_report(
  p_client       uuid,
  p_reporter     uuid,
  p_author       uuid,
  p_content_type text,
  p_content_ref  text,
  p_snapshot     text,
  p_url          text,
  p_reason       platform."reportReason",
  p_description  text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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

-- ── Registering an external app ──────────────────────────────────────────────

-- Turns an OAuth client into a production moderation app, declaring its content
-- types in the same call. Idempotent by slug. Re-pointing an app at a
-- replacement client moves the registration: the old client reverts to a
-- development client, with its secret and endpoint untouched.
create function platform.register_external_app(
  p_slug          text,
  p_display_name  text,
  p_client_id     uuid,
  p_endpoint_url  text,
  p_content_types jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  app_id uuid;
  ct     jsonb;
begin
  if p_slug !~ '^[a-z][a-z0-9-]{1,40}$' then
    raise exception 'moderation:invalid_request';
  end if;
  if jsonb_typeof(p_content_types) is distinct from 'array'
     or jsonb_array_length(p_content_types) = 0 then
    raise exception 'moderation:invalid_request';
  end if;

  select a."id" into app_id from "platform"."apps" a where a."slug" = p_slug;
  if found then
    if exists (select 1 from "platform"."apps" a where a."id" = app_id and a."kind" <> 'external') then
      raise exception 'App "%" is a platform app, not an external one', p_slug;
    end if;
    update "platform"."apps" set "displayName" = p_display_name where "id" = app_id;
  else
    insert into "platform"."apps" ("slug", "displayName", "kind")
    values (p_slug, p_display_name, 'external')
    returning "id" into app_id;
  end if;

  update "platform"."moderationClients"
  set "appId" = null, "updatedAt" = now()
  where "appId" = app_id and "clientId" <> p_client_id;

  insert into "platform"."moderationClients" ("clientId", "appId", "endpointUrl")
  values (p_client_id, app_id, p_endpoint_url)
  on conflict ("clientId") do update
    set "appId" = excluded."appId",
        "endpointUrl" = excluded."endpointUrl",
        "updatedAt" = now();

  delete from "platform"."externalContentTypes" t
  where t."appId" = app_id
    and t."contentType" not in (
      select e ->> 'contentType' from jsonb_array_elements(p_content_types) e
    );

  for ct in select * from jsonb_array_elements(p_content_types) loop
    insert into "platform"."externalContentTypes" ("appId", "contentType", "label", "urlTemplate")
    values (app_id, ct ->> 'contentType', ct ->> 'label', ct ->> 'urlTemplate')
    on conflict ("appId", "contentType") do update
      set "label" = excluded."label", "urlTemplate" = excluded."urlTemplate";
  end loop;

  return app_id;
end;
$function$;

-- ── Grants: service role and postgres only ───────────────────────────────────

revoke all on function "platform".enqueue_moderation_delivery(uuid, text, jsonb, uuid) from public, "anon", "authenticated";
grant execute on function "platform".enqueue_moderation_delivery(uuid, text, jsonb, uuid) to "postgres", "service_role";

revoke all on function "platform".enqueue_user_standing(uuid, text, text, uuid, uuid) from public, "anon", "authenticated";
grant execute on function "platform".enqueue_user_standing(uuid, text, text, uuid, uuid) to "postgres", "service_role";

revoke all on function "platform".file_external_report(uuid, uuid, uuid, text, text, text, text, "platform"."reportReason", text) from public, "anon", "authenticated";
grant execute on function "platform".file_external_report(uuid, uuid, uuid, text, text, text, text, "platform"."reportReason", text) to "postgres", "service_role";

revoke all on function "platform".file_sandbox_report(uuid, uuid, uuid, text, text, text, text, "platform"."reportReason", text) from public, "anon", "authenticated";
grant execute on function "platform".file_sandbox_report(uuid, uuid, uuid, text, text, text, text, "platform"."reportReason", text) to "postgres", "service_role";

revoke all on function "platform".register_external_app(text, text, uuid, text, jsonb) from public, "anon", "authenticated";
grant execute on function "platform".register_external_app(text, text, uuid, text, jsonb) to "postgres", "service_role";
