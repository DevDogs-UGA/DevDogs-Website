CREATE TABLE "platform"."apps" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "slug"            text                        NOT NULL,
  "schemaName"      text,
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

ALTER TABLE "platform"."apps"
  ADD COLUMN "kind" platform."appKind" NOT NULL DEFAULT 'internal'::platform."appKind";

ALTER TABLE "platform"."apps"
  ADD CONSTRAINT "apps_kind_shape_check" CHECK ((((kind = 'internal'::platform."appKind") AND ("schemaName" IS
    NOT NULL)) OR ((kind = 'external'::platform."appKind") AND ("schemaName" IS NULL) AND ("contentResolver" IS NULL) AND ("contentActioner" IS NULL))));

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
