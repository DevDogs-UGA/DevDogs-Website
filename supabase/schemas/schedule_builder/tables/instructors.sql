CREATE TABLE "schedule_builder"."instructors" (
  "id"        integer           NOT NULL DEFAULT nextval('schedule_builder.instructors_id_seq'::regclass),
  "firstName" character varying NOT NULL,
  "lastName"  character varying NOT NULL,
  CONSTRAINT "instructors_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_full_name" UNIQUE ("firstName", "lastName")
);

ALTER TABLE "schedule_builder"."instructors"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."instructors_id_seq" OWNED BY "schedule_builder"."instructors"."id";

CREATE POLICY "public_read" ON "schedule_builder"."instructors"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."instructors" TO "anon", "authenticated", "postgres", "service_role";
