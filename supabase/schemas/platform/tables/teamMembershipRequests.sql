CREATE TABLE "platform"."teamMembershipRequests" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "teamId"      uuid                     NOT NULL,
  "userId"      uuid                     NOT NULL,
  "createdBy"   uuid                     NOT NULL,
  "message"     text,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "notifiedAt"  timestamp with time zone,
  "respondedAt" timestamp with time zone,
  "respondedBy" uuid,
  "expiresAt"   timestamp with time zone,
  CONSTRAINT "teamMembershipRequests_pkey" PRIMARY KEY (id),
  CONSTRAINT "teamMembershipRequests_responded_together" CHECK ((("respondedAt" IS NULL) = ("respondedBy" IS NULL))),
  CONSTRAINT "teamMembershipRequests_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "teamMembershipRequests_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES platform.teams(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."teamMembershipRequests"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."teamMembershipRequests"
  ADD COLUMN "direction" platform."membershipDirection" NOT NULL;

ALTER TABLE "platform"."teamMembershipRequests"
  ADD COLUMN "status" platform."membershipRequestStatus" NOT NULL DEFAULT 'pending'::platform."membershipRequestStatus";

ALTER TABLE "platform"."teamMembershipRequests"
  ADD CONSTRAINT "teamMembershipRequests_pending_unresponded" CHECK (((status <> 'pending'::platform."membershipRequestStatus") OR ("respondedAt" IS NULL)));

CREATE UNIQUE INDEX "teamMembershipRequests_one_pending_per_team_user" ON platform."teamMembershipRequests" USING btree ("teamId", "userId")
  WHERE (status = 'pending'::platform."membershipRequestStatus");

CREATE INDEX "teamMembershipRequests_unnotified" ON platform."teamMembershipRequests" USING btree ("createdAt")
  WHERE ((status = 'pending'::platform."membershipRequestStatus") AND ("notifiedAt" IS NULL));

CREATE POLICY "no_client_delete" ON "platform"."teamMembershipRequests"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."teamMembershipRequests"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."teamMembershipRequests"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_or_team_select" ON "platform"."teamMembershipRequests"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM platform."teamMembers" tm
  WHERE ((tm."teamId" = "teamMembershipRequests"."teamId") AND (tm."userId" = ( SELECT auth.uid() AS uid)) AND (tm."leftAt" IS NULL))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."teamMembershipRequests" TO "anon", "authenticated", "postgres", "service_role";
