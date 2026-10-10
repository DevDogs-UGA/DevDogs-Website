CREATE TABLE "platform"."configReconcileState" (
  "id"                     boolean                  NOT NULL DEFAULT true,
  "workerVersionId"        text                     NOT NULL,
  "workerVersionTimestamp" timestamp with time zone NOT NULL,
  "configHash"             text                     NOT NULL,
  "appliedAt"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "configReconcileState_pkey" PRIMARY KEY (id),
  CONSTRAINT "configReconcileState_single_row" CHECK (id)
);

ALTER TABLE "platform"."configReconcileState"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."configReconcileState"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."configReconcileState"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."configReconcileState"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."configReconcileState"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."configReconcileState" TO "anon", "authenticated", "postgres", "service_role";
