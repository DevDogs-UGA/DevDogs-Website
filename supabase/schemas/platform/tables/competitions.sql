CREATE TABLE "platform"."competitions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "issueNodeId"    text                     NOT NULL,
  "issueNumber"    integer                  NOT NULL,
  "repo"           text                     NOT NULL,
  "url"            text                     NOT NULL,
  "slug"           text                     NOT NULL,
  "title"          text                     NOT NULL,
  "brief"          text,
  "plannedEndAt"   timestamp with time zone,
  "kickedOffAt"    timestamp with time zone NOT NULL,
  "closedAt"       timestamp with time zone,
  "githubSyncedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "competitions_issueNodeId_key" UNIQUE ("issueNodeId"),
  CONSTRAINT "competitions_pkey" PRIMARY KEY (id),
  CONSTRAINT "competitions_slug_key" UNIQUE (slug),
  CONSTRAINT "competitions_title_length" CHECK ((char_length(title) <= 160))
);

ALTER TABLE "platform"."competitions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "competitions_kickedOffAt_idx" ON platform.competitions USING btree ("kickedOffAt" DESC);

CREATE POLICY "no_client_delete" ON "platform"."competitions"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."competitions"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."competitions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."competitions"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."competitions" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "platform"."competitions"."brief" IS 'The issue body, markdown. This is the competition''s brief -- what officers write when they draft the item, before it is ever converted.';

COMMENT ON COLUMN "platform"."competitions"."closedAt" IS 'When the issue closed. Null means the competition is still open. This is the one clock the platform reads for "is this competition over" -- `plannedEndAt` never is.';

COMMENT ON COLUMN "platform"."competitions"."githubSyncedAt" IS 'Last time something confirmed this row against GitHub: an ingestion call from the webhook route, or the nightly `github-reconcile` cron paging the Project. Mirrors `teams."githubSyncedAt"''s freshness role.';

COMMENT ON COLUMN "platform"."competitions"."kickedOffAt" IS 'When the draft Project item was converted into this issue -- the moment `server/github/competitions.ts` calls kickoff. Not the issue''s own `createdAt`: a draft can sit in the Project for a while before conversion.';

COMMENT ON COLUMN "platform"."competitions"."plannedEndAt" IS 'The Project''s planned judging/end date field. Display-only: shown on the competition page as a heads-up, never read to gate entries or compute a deadline. `closedAt` is the real "is this over" signal.';

COMMENT ON COLUMN "platform"."competitions"."title" IS 'From the Project''s "Title" field, falling back to the issue''s own title. Refreshed on every `edited` projects_v2_item webhook and by the nightly reconcile, so an officer retitling the issue or the field updates this column instead of orphaning it.';
