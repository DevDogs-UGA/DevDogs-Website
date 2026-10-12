CREATE TABLE "schedule_builder"."subjects" (
  "id"          integer              NOT NULL DEFAULT nextval('schedule_builder.subjects_id_seq'::regclass),
  "abbr"        character varying(4) NOT NULL,
  CONSTRAINT "subjects_abbr_key" UNIQUE (abbr),
  CONSTRAINT "subjects_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."subjects"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."subjects_id_seq" OWNED BY "schedule_builder"."subjects"."id";

CREATE POLICY "public_read" ON "schedule_builder"."subjects"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."subjects" TO "anon", "authenticated", "postgres", "service_role";
