CREATE TABLE "platform"."teams" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"              text                     NOT NULL,
  "name"              text                     NOT NULL,
  "joinCode"          text                     NOT NULL,
  "createdBy"         uuid                     NOT NULL,
  "acceptingRequests" boolean                  NOT NULL DEFAULT true,
  "githubSyncedAt"    timestamp with time zone,
  CONSTRAINT "teams_pkey" PRIMARY KEY (id),
  CONSTRAINT "teams_slug_key" UNIQUE (slug)
);

ALTER TABLE "platform"."teams"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_delete" ON "platform"."teams"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."teams"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."teams"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."teams"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."teams" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."teams" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ON TABLE "platform"."teams" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."teams" TO "authenticated";

REVOKE ALL ("acceptingRequests") ON TABLE "platform"."teams" FROM "anon";

GRANT SELECT ("acceptingRequests") ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ("createdBy") ON TABLE "platform"."teams" FROM "anon";

GRANT SELECT ("createdBy") ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ("id") ON TABLE "platform"."teams" FROM "anon";

GRANT SELECT ("id") ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ("name") ON TABLE "platform"."teams" FROM "anon";

GRANT SELECT ("name") ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ("slug") ON TABLE "platform"."teams" FROM "anon";

GRANT SELECT ("slug") ON TABLE "platform"."teams" TO "anon";

REVOKE ALL ("acceptingRequests") ON TABLE "platform"."teams" FROM "authenticated";

GRANT SELECT ("acceptingRequests") ON TABLE "platform"."teams" TO "authenticated";

REVOKE ALL ("createdBy") ON TABLE "platform"."teams" FROM "authenticated";

GRANT SELECT ("createdBy") ON TABLE "platform"."teams" TO "authenticated";

REVOKE ALL ("id") ON TABLE "platform"."teams" FROM "authenticated";

GRANT SELECT ("id") ON TABLE "platform"."teams" TO "authenticated";

REVOKE ALL ("name") ON TABLE "platform"."teams" FROM "authenticated";

GRANT SELECT ("name") ON TABLE "platform"."teams" TO "authenticated";

REVOKE ALL ("slug") ON TABLE "platform"."teams" FROM "authenticated";

GRANT SELECT ("slug") ON TABLE "platform"."teams" TO "authenticated";
