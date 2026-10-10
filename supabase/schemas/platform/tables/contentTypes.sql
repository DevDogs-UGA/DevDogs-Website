CREATE TABLE "platform"."contentTypes" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "appId"           uuid                        NOT NULL,
  "tableName"       text                        NOT NULL,
  "contentType"     text,
  "label"           text,
  "authorColumn"    text,
  "snapshotColumns" text[],
  "urlTemplate"     text,
  "createdAt"       timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "contentTypes_appId_fkey" FOREIGN KEY ("appId") REFERENCES platform.apps(id) ON DELETE CASCADE,
  CONSTRAINT "contentTypes_app_table_key" UNIQUE ("appId", "tableName"),
  CONSTRAINT "contentTypes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."contentTypes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."contentTypes"
  ADD COLUMN "visibility" platform."contentVisibility";

ALTER TABLE "platform"."contentTypes"
  ADD COLUMN "quarantineEffect" platform."quarantineEffect";

CREATE UNIQUE INDEX "contentTypes_app_type_idx" ON platform."contentTypes" USING btree ("appId", "contentType")
  WHERE ("contentType" IS NOT NULL);

CREATE TRIGGER "contentTypes_validate"
  BEFORE INSERT OR UPDATE ON platform."contentTypes"
  FOR EACH ROW
  EXECUTE FUNCTION platform.validate_content_type();

CREATE POLICY "authenticated_select" ON "platform"."contentTypes"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "deny_test_identities" ON "platform"."contentTypes"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))))
  WITH CHECK ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))));

CREATE POLICY "no_client_delete" ON "platform"."contentTypes"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."contentTypes"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."contentTypes"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."contentTypes" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "platform"."contentTypes"."quarantineEffect" IS 'What quarantine does to this type. Null coalesces to ''hide'', which is the right default: hiding is what an app with user-generated content almost always means, and it is the case that needs the read-policy check. ''freeze'' declares that the row stays visible and stops being editable instead.';
