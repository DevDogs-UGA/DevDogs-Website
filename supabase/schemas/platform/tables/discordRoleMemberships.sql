CREATE TABLE "platform"."discordRoleMemberships" (
  "userId"   uuid                     NOT NULL,
  "roleId"   uuid                     NOT NULL,
  "syncedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "discordRoleMemberships_pkey" PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "discordRoleMemberships_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "discordRoleMemberships_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES platform.roles(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."discordRoleMemberships"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "discordRoleMemberships_roleId_idx" ON platform."discordRoleMemberships" USING btree ("roleId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."discordRoleMemberships"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."discordRoleMemberships"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."discordRoleMemberships"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."discordRoleMemberships"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."discordRoleMemberships" TO "anon", "authenticated", "postgres", "service_role";
