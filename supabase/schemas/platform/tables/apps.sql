CREATE TABLE "platform"."apps" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "slug"            text                        NOT NULL,
  "schemaName"      text                        NOT NULL,
  "displayName"     text                        NOT NULL,
  "contentResolver" text,
  "contentActioner" text,
  "createdAt"       timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "apps_pkey" PRIMARY KEY (id),
  CONSTRAINT "apps_schemaName_key" UNIQUE ("schemaName"),
  CONSTRAINT "apps_slug_key" UNIQUE (slug)
);

ALTER TABLE "platform"."apps"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER apps_validate_schema
  BEFORE INSERT OR UPDATE ON platform.apps
  FOR EACH ROW
  EXECUTE FUNCTION platform.validate_app_schema();

CREATE POLICY "no_client_delete" ON "platform"."apps"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."apps"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."apps"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."apps"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."apps" TO "anon", "authenticated", "postgres", "service_role";
