CREATE TABLE "schedule_builder"."departments" (
  "id"          integer           NOT NULL DEFAULT nextval('schedule_builder.departments_id_seq'::regclass),
  "description" character varying NOT NULL,
  "collegeId"   integer           NOT NULL,
  CONSTRAINT "departments_collegeId_colleges_id_fkey" FOREIGN KEY ("collegeId") REFERENCES schedule_builder.colleges(id),
  CONSTRAINT "departments_description_key" UNIQUE (description),
  CONSTRAINT "departments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."departments"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."departments_id_seq" OWNED BY "schedule_builder"."departments"."id";

CREATE POLICY "public_read" ON "schedule_builder"."departments"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."departments" TO "anon", "authenticated", "postgres", "service_role";
