CREATE TABLE "platform"."profileAcademicPrograms" (
  "userId"    uuid     NOT NULL,
  "programId" integer  NOT NULL,
  "sortOrder" smallint NOT NULL,
  CONSTRAINT "profileAcademicPrograms_pkey" PRIMARY KEY ("userId", "programId"),
  CONSTRAINT "profileAcademicPrograms_programId_academicPrograms_id_fkey" FOREIGN KEY ("programId") REFERENCES platform."academicPrograms"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "profileAcademicPrograms_sortOrder_nonnegative" CHECK (("sortOrder" >= 0)),
  CONSTRAINT "profileAcademicPrograms_userId_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES platform.profile("userId") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "profileAcademicPrograms_userId_sortOrder_key" UNIQUE ("userId", "sortOrder")
);

ALTER TABLE "platform"."profileAcademicPrograms"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_authenticated_policy_select" ON "platform"."profileAcademicPrograms"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

CREATE POLICY "no_client_delete" ON "platform"."profileAcademicPrograms"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."profileAcademicPrograms"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."profileAcademicPrograms"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."profileAcademicPrograms" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "platform"."profileAcademicPrograms" IS 'A member''s ordered programs of study, keyed to distinct Bulletin credentials so identically named bachelor''s and master''s programs remain separate.';
