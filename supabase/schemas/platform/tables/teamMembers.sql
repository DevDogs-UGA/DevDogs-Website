CREATE TABLE "platform"."teamMembers" (
  "id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "teamId"   uuid                     NOT NULL,
  "userId"   uuid                     NOT NULL,
  "joinedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "leftAt"   timestamp with time zone,
  CONSTRAINT "teamMembers_pkey" PRIMARY KEY (id),
  CONSTRAINT "teamMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "teamMembers_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES platform.teams(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."teamMembers"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."teamMembers"
  ADD COLUMN "role" platform."teamRole" NOT NULL DEFAULT 'member'::platform."teamRole";

CREATE UNIQUE INDEX "teamMembers_one_active_per_team_user" ON platform."teamMembers" USING btree ("teamId", "userId")
  WHERE ("leftAt" IS NULL);

CREATE UNIQUE INDEX "teamMembers_one_lead_per_team" ON platform."teamMembers" USING btree ("teamId")
  WHERE ((ROLE = 'lead'::platform."teamRole") AND ("leftAt" IS NULL));

CREATE INDEX "teamMembers_userId_active_idx" ON platform."teamMembers" USING btree ("userId")
  WHERE ("leftAt" IS NULL);

CREATE POLICY "authenticated_select" ON "platform"."teamMembers"
  FOR SELECT
  TO "authenticated"
  USING (("leftAt" IS NULL));

CREATE POLICY "no_client_delete" ON "platform"."teamMembers"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."teamMembers"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."teamMembers"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "team_member_select_history" ON "platform"."teamMembers"
  FOR SELECT
  TO "authenticated"
  USING ((("leftAt" IS NOT NULL) AND platform.is_active_team_member("teamId", ( SELECT auth.uid() AS uid))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."teamMembers" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "platform"."teamMembers"."leftAt" IS 'Null while the member is active. Set once, on leave; a rejoin is a new row, not a cleared one. Active membership is "leftAt is null" everywhere this table is read.';
