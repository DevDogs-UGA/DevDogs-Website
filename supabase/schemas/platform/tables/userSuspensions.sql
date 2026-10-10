CREATE TABLE "platform"."userSuspensions" (
  "id"          uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "userId"      uuid                        NOT NULL,
  "service"     text                        NOT NULL,
  "reason"      text,
  "suspendedAt" timestamp without time zone NOT NULL DEFAULT now(),
  "suspendedBy" uuid,
  CONSTRAINT "userSuspensions_pkey" PRIMARY KEY (id),
  CONSTRAINT "userSuspensions_suspendedBy_users_id_fkey" FOREIGN KEY ("suspendedBy") REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "userSuspensions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."userSuspensions"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "userSuspensions_user_service_idx" ON platform."userSuspensions" USING btree ("userId", service);

CREATE POLICY "crud_public_policy_delete" ON "platform"."userSuspensions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."userSuspensions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."userSuspensions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."userSuspensions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."userSuspensions" TO "anon", "authenticated", "postgres", "service_role";
