CREATE TABLE "schedule_builder"."courses" (
  "id"                    integer           NOT NULL DEFAULT nextval('schedule_builder.courses_id_seq'::regclass),
  "abbr"                  character varying NOT NULL,
  "title"                 character varying NOT NULL,
  "abbrTitle"             character varying NOT NULL,
  "courseNumber"          character varying NOT NULL,
  "minCreditHours"        real              NOT NULL,
  "maxCreditHours"        real              NOT NULL,
  "minBillingCreditHours" real              NOT NULL,
  "honors"                boolean           NOT NULL DEFAULT false,
  "collegeId"             integer           NOT NULL,
  "departmentId"          integer,
  "subjectId"             integer           NOT NULL,
  CONSTRAINT "courses_abbr_key" UNIQUE (abbr),
  CONSTRAINT "courses_collegeId_colleges_id_fkey" FOREIGN KEY ("collegeId") REFERENCES schedule_builder.colleges(id),
  CONSTRAINT "courses_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_subject_courseNumber" UNIQUE ("subjectId", "courseNumber"),
  CONSTRAINT "courses_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES schedule_builder.departments(id),
  CONSTRAINT "courses_subjectId_subjects_id_fkey" FOREIGN KEY ("subjectId") REFERENCES schedule_builder.subjects(id)
);

ALTER TABLE "schedule_builder"."courses"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."courses_id_seq" OWNED BY "schedule_builder"."courses"."id";

CREATE INDEX "courses_search_idx" ON schedule_builder.courses USING gin (to_tsvector('english'::regconfig, ((((((abbr)::text || ' '::text) || regexp_replace((abbr)::text, '^([A-Za-z]+)([0-9])'::text, '\1 \2'::text)) || ' '::text) || (title)::text))));

CREATE POLICY "public_read" ON "schedule_builder"."courses"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."courses" TO "anon", "authenticated", "postgres", "service_role";
