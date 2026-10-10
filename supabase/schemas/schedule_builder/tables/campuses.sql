CREATE TABLE "schedule_builder"."campuses" (
  "id"          integer           NOT NULL DEFAULT nextval('schedule_builder.campuses_id_seq'::regclass),
  "abbr"        character varying NOT NULL,
  "description" character varying NOT NULL,
  CONSTRAINT "campuses_abbr_key" UNIQUE (abbr),
  CONSTRAINT "campuses_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."campuses"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."campuses_id_seq" OWNED BY "schedule_builder"."campuses"."id";

CREATE POLICY "public_read" ON "schedule_builder"."campuses"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."campuses" TO "anon", "authenticated", "postgres", "service_role";
