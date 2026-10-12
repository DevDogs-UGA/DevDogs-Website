-- The catalog API's read-only role.
--
-- A role is a cluster object, which the declarative schema tree cannot hold
-- (`supabase db schema declarative sync` loads the tree into a fresh shadow
-- with no roles, so any GRANT naming this role would fail there, and a tree
-- without the grants would make the next sync REVOKE them). So the role is
-- created here, the way migration 50 creates `oauth_identity`, and holds no
-- grants of its own.
--
-- What it can do comes only from PUBLIC: supabase/schemas/uga grants USAGE on
-- schema `uga` and SELECT on its views to PUBLIC, because the registrar data
-- behind them is already public. The role has nothing on `schedule_builder`
-- or any other schema, and nothing on `uga."scrapeRuns"`, so switching to it
-- is a privilege drop from `postgres` to "can read the catalog views".
--
-- It has no login. The catalog Worker connects as `postgres` through Hyperdrive
-- and runs each read inside a read-only transaction that starts with
-- `set local role catalog_reader`, so the membership below is what lets
-- `postgres` switch to it (it does not inherit anything from it).
--
-- The role-level statement_timeout applies to a direct login as the role. Under
-- `set role` Postgres does not apply role defaults, so the Worker also sets it
-- per transaction (apps/catalog/src/db/reader.ts); the two are meant to agree.
create role "catalog_reader" nologin noinherit;

alter role "catalog_reader" set statement_timeout = '3s';

grant "catalog_reader" to "postgres" with inherit false, set true;

-- The Bulletin program sync moved from the platform's nightly-repair cron to the
-- catalog Worker, and reports through its own heartbeat row. The platform's
-- daily-jobs check treats a missing row as overdue, so the row exists before
-- the check starts looking for it (apps/platform/src/server/heartbeats/jobs.ts).
insert into platform."jobHeartbeats" ("job") values ('catalog-academic-programs') on conflict do nothing;
