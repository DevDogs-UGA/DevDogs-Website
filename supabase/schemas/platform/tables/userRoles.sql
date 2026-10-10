CREATE TABLE "platform"."userRoles" (
  "userId" uuid NOT NULL,
  "roleId" uuid NOT NULL,
  CONSTRAINT "userRoles_pkey" PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "userRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES platform.roles(id) ON DELETE CASCADE,
  CONSTRAINT "userRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."userRoles"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "userRoles_refresh_resolved_permissions"
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON platform."userRoles"
  FOR EACH STATEMENT
  EXECUTE FUNCTION platform.refresh_resolved_user_permissions();

CREATE POLICY "crud_public_policy_delete" ON "platform"."userRoles"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."userRoles"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."userRoles"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."userRoles"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."userRoles" TO "anon", "authenticated", "postgres", "service_role";
