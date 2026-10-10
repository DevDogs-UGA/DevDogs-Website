CREATE TABLE "schedule_builder"."terms" (
  "academicPeriod" integer           NOT NULL,
  "description"    character varying NOT NULL,
  CONSTRAINT "terms_pkey" PRIMARY KEY ("academicPeriod")
);

ALTER TABLE "schedule_builder"."terms"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON "schedule_builder"."terms"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."terms" TO "anon", "authenticated", "postgres", "service_role";
