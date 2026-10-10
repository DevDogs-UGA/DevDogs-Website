CREATE TABLE "platform"."oauthTestAccounts" (
  "testUserId"  uuid                        NOT NULL,
  "ownerUserId" uuid                        NOT NULL,
  "createdAt"   timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "oauthTestAccounts_ownerUserId_users_id_fkey" FOREIGN KEY ("ownerUserId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "oauthTestAccounts_pkey" PRIMARY KEY ("testUserId"),
  CONSTRAINT "oauthTestAccounts_testUserId_users_id_fkey" FOREIGN KEY ("testUserId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."oauthTestAccounts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "oauthTestAccounts_ownerUserId_idx" ON platform."oauthTestAccounts" USING btree ("ownerUserId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."oauthTestAccounts"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."oauthTestAccounts"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."oauthTestAccounts"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."oauthTestAccounts"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."oauthTestAccounts" TO "anon", "authenticated", "postgres", "service_role";
