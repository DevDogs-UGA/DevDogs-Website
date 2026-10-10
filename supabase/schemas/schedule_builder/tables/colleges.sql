CREATE TABLE "schedule_builder"."colleges" (
  "id"          integer           NOT NULL DEFAULT nextval('schedule_builder.colleges_id_seq'::regclass),
  "description" character varying NOT NULL,
  CONSTRAINT "colleges_description_key" UNIQUE (description),
  CONSTRAINT "colleges_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."colleges"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."colleges_id_seq" OWNED BY "schedule_builder"."colleges"."id";

CREATE POLICY "public_read" ON "schedule_builder"."colleges"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."colleges" TO "anon", "authenticated", "postgres", "service_role";
