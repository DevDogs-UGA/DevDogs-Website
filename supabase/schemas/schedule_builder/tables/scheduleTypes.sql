CREATE TABLE "schedule_builder"."scheduleTypes" (
  "id"          integer           NOT NULL DEFAULT nextval('schedule_builder."scheduleTypes_id_seq"'::regclass),
  "abbr"        character varying NOT NULL,
  "description" character varying NOT NULL,
  CONSTRAINT "scheduleTypes_abbr_key" UNIQUE (abbr),
  CONSTRAINT "scheduleTypes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."scheduleTypes"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."scheduleTypes_id_seq" OWNED BY "schedule_builder"."scheduleTypes"."id";

CREATE POLICY "public_read" ON "schedule_builder"."scheduleTypes"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."scheduleTypes" TO "anon", "authenticated", "postgres", "service_role";
