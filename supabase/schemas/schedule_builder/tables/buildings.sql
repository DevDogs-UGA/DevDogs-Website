CREATE TABLE "schedule_builder"."buildings" (
  "id"          integer           NOT NULL,
  "description" character varying NOT NULL,
  "address"     character varying,
  "latitude"    double precision,
  "longitude"   double precision,
  CONSTRAINT "buildings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."buildings"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON "schedule_builder"."buildings"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."buildings" TO "anon", "authenticated", "postgres", "service_role";
