CREATE TABLE "schedule_builder"."partsOfTerm" (
  "academicPeriod"     integer           NOT NULL,
  "code"               character varying NOT NULL,
  "description"        character varying NOT NULL,
  "classesBegin"       date              NOT NULL,
  "dropAddEnds"        date              NOT NULL,
  "censusDate"         date              NOT NULL,
  "withdrawalDeadline" date              NOT NULL,
  "classesEnd"         date              NOT NULL,
  "finalsEnd"          date,
  CONSTRAINT "partsOfTerm_pkey" PRIMARY KEY ("academicPeriod", code),
  CONSTRAINT "partsOfTerm_academicPeriod_terms_academicPeriod_fkey" FOREIGN KEY ("academicPeriod") REFERENCES schedule_builder.terms("academicPeriod")
);

ALTER TABLE "schedule_builder"."partsOfTerm"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON "schedule_builder"."partsOfTerm"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."partsOfTerm" TO "anon", "authenticated", "postgres", "service_role";
