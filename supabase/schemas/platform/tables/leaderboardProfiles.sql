CREATE TABLE "platform"."leaderboardProfiles" (
  "githubId"           character varying(255) NOT NULL,
  "githubLogin"        character varying(255) NOT NULL,
  "avatarUrl"          text,
  "allTimePoints"      integer                NOT NULL DEFAULT 0,
  "allTimeRanking"     integer,
  "currentYearPoints"  integer                NOT NULL DEFAULT 0,
  "currentYearRanking" integer,
  CONSTRAINT "leaderboardProfiles_githubLogin_key" UNIQUE ("githubLogin"),
  CONSTRAINT "leaderboardProfiles_pkey" PRIMARY KEY ("githubId")
);

ALTER TABLE "platform"."leaderboardProfiles"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX login_idx ON platform."leaderboardProfiles" USING btree (lower(("githubLogin")::text));

CREATE POLICY "crud_public_policy_delete" ON "platform"."leaderboardProfiles"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."leaderboardProfiles"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."leaderboardProfiles"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."leaderboardProfiles"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."leaderboardProfiles" TO "anon", "authenticated", "postgres", "service_role";
