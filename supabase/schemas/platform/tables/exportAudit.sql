CREATE TABLE "platform"."exportAudit" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"    uuid,
  "kind"      text                     NOT NULL,
  "filters"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "rowCount"  integer,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exportAudit_pkey" PRIMARY KEY (id),
  CONSTRAINT "exportAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

ALTER TABLE "platform"."exportAudit"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "exportAudit_createdAt_idx" ON platform."exportAudit" USING btree ("createdAt" DESC);

CREATE TRIGGER "exportAudit_append_general_event"
  AFTER INSERT ON platform."exportAudit"
  FOR EACH ROW
  EXECUTE FUNCTION platform.audit_export_insert();

CREATE POLICY "no_client_delete" ON "platform"."exportAudit"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."exportAudit"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."exportAudit"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."exportAudit" TO "anon", "authenticated", "postgres", "service_role";
