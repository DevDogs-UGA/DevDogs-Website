CREATE TABLE "platform"."academicPrograms" (
  "id"          integer                  NOT NULL,
  "name"        text                     NOT NULL,
  "credential"  text                     NOT NULL,
  "schoolCode"  text,
  "bulletinUrl" text                     NOT NULL,
  "active"      boolean                  NOT NULL DEFAULT true,
  "lastSeenAt"  timestamp with time zone NOT NULL,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academicPrograms_credential_nonempty" CHECK ((btrim(credential) <> ''::text)),
  CONSTRAINT "academicPrograms_id_positive" CHECK ((id > 0)),
  CONSTRAINT "academicPrograms_name_nonempty" CHECK ((btrim(name) <> ''::text)),
  CONSTRAINT "academicPrograms_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."academicPrograms"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."academicPrograms"
  ADD COLUMN "category" platform."academicProgramCategory" NOT NULL;

CREATE INDEX "academicPrograms_active_name_idx" ON platform."academicPrograms" USING btree (active, name, credential);

CREATE POLICY "authenticated_select" ON "platform"."academicPrograms"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "no_client_delete" ON "platform"."academicPrograms"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."academicPrograms"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."academicPrograms"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."academicPrograms" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "platform"."academicPrograms" IS 'Daily mirror of credential-bearing programs from the UGA Bulletin. Rows missing from one successful scrape are retained with active=false so profile history is not deleted.';
