CREATE TABLE "platform"."jobHeartbeats" (
  "job"         text                     NOT NULL,
  "succeededAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "jobHeartbeats_pkey" PRIMARY KEY (job)
);

ALTER TABLE "platform"."jobHeartbeats"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."jobHeartbeats"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."jobHeartbeats"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."jobHeartbeats"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."jobHeartbeats"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."jobHeartbeats" TO "anon", "authenticated", "postgres", "service_role";
