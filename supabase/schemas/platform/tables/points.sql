CREATE TABLE "platform"."points" (
  "leaderboardProfileId" character varying(255) NOT NULL,
  "year"                 integer                NOT NULL,
  "streakStart"          date                   NOT NULL,
  "streakLength"         integer                NOT NULL DEFAULT 0,
  "longestStreakLength"  integer                NOT NULL DEFAULT 0,
  "projectPoints"        integer                NOT NULL DEFAULT 0,
  "streakBonusPoints"    integer                NOT NULL DEFAULT 0,
  "academyPoints"        integer                NOT NULL DEFAULT 0,
  CONSTRAINT "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey" FOREIGN KEY ("leaderboardProfileId") REFERENCES platform."leaderboardProfiles"("githubId")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "points_pkey" PRIMARY KEY ("leaderboardProfileId", year)
);

ALTER TABLE "platform"."points"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."points"
  ADD COLUMN "points" integer GENERATED ALWAYS AS ((("projectPoints" + "streakBonusPoints") + "academyPoints")) STORED NOT NULL;

CREATE POLICY "crud_public_policy_delete" ON "platform"."points"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."points"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."points"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."points"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."points" TO "anon", "authenticated", "postgres", "service_role";
