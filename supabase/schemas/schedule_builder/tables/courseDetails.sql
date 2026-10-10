CREATE TABLE "schedule_builder"."courseDetails" (
  "id"                integer                     NOT NULL DEFAULT nextval('schedule_builder."courseDetails_id_seq"'::regclass),
  "description"       text,
  "gradingSystem"     character varying,
  "semesterOffered"   character varying,
  "corequisite"       text,
  "equivalentCourses" text,
  "lastFetched"       timestamp without time zone NOT NULL,
  "courseId"          integer                     NOT NULL,
  "prerequisites"     jsonb,
  CONSTRAINT "courseDetails_pkey" PRIMARY KEY (id),
  CONSTRAINT "courseDetails_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES schedule_builder.courses(id)
);

ALTER TABLE "schedule_builder"."courseDetails"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."courseDetails_id_seq" OWNED BY "schedule_builder"."courseDetails"."id";

CREATE POLICY "public_read" ON "schedule_builder"."courseDetails"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."courseDetails" TO "anon", "authenticated", "postgres", "service_role";
