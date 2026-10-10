CREATE TABLE "platform"."competitionEntries" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "competitionId" uuid                     NOT NULL,
  "teamId"        uuid                     NOT NULL,
  "prNodeId"      text                     NOT NULL,
  "prNumber"      integer                  NOT NULL,
  "url"           text                     NOT NULL,
  "openedAt"      timestamp with time zone NOT NULL,
  "mergedAt"      timestamp with time zone,
  "closedAt"      timestamp with time zone,
  CONSTRAINT "competitionEntries_pkey" PRIMARY KEY (id),
  CONSTRAINT "competitionEntries_prNodeId_key" UNIQUE ("prNodeId"),
  CONSTRAINT "competitionEntries_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES platform.competitions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "competitionEntries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES platform.teams(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."competitionEntries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "competitionEntries_competitionId_idx" ON platform."competitionEntries" USING btree ("competitionId");

CREATE INDEX "competitionEntries_teamId_idx" ON platform."competitionEntries" USING btree ("teamId");

CREATE POLICY "no_client_delete" ON "platform"."competitionEntries"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."competitionEntries"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."competitionEntries"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."competitionEntries"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."competitionEntries" TO "anon", "authenticated", "postgres", "service_role";
