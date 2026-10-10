CREATE TABLE "schedule_builder"."offerings" (
  "crn"               integer                     NOT NULL,
  "crossListingId"    character varying,
  "minimumEnrollment" integer                     NOT NULL DEFAULT 0,
  "maximumEnrollment" integer                     NOT NULL,
  "actualEnrollment"  integer                     NOT NULL,
  "seatsAvailable"    integer                     NOT NULL,
  "cancelled"         boolean                     NOT NULL DEFAULT false,
  "lastSeenAt"        timestamp without time zone NOT NULL DEFAULT now(),
  "academicPeriod"    integer                     NOT NULL,
  "partOfTerm"        character varying           NOT NULL,
  "courseId"          integer                     NOT NULL,
  "instructorId"      integer,
  "scheduleTypeId"    integer                     NOT NULL,
  "campusId"          integer                     NOT NULL,
  CONSTRAINT "offerings_campusId_campuses_id_fkey" FOREIGN KEY ("campusId") REFERENCES schedule_builder.campuses(id),
  CONSTRAINT "offerings_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES schedule_builder.courses(id),
  CONSTRAINT "offerings_instructorId_instructors_id_fkey" FOREIGN KEY ("instructorId") REFERENCES schedule_builder.instructors(id),
  CONSTRAINT "offerings_pkey" PRIMARY KEY ("academicPeriod", crn),
  CONSTRAINT "offerings_academicPeriod_partOfTerm_fkey" FOREIGN KEY ("academicPeriod", "partOfTerm") REFERENCES schedule_builder."partsOfTerm"("academicPeriod", code),
  CONSTRAINT "offerings_scheduleTypeId_scheduleTypes_id_fkey" FOREIGN KEY ("scheduleTypeId") REFERENCES schedule_builder."scheduleTypes"(id),
  CONSTRAINT "offerings_academicPeriod_terms_academicPeriod_fkey" FOREIGN KEY ("academicPeriod") REFERENCES schedule_builder.terms("academicPeriod")
);

ALTER TABLE "schedule_builder"."offerings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "offerings_academicPeriod_partOfTerm_index" ON schedule_builder.offerings USING btree ("academicPeriod", "partOfTerm");

CREATE INDEX "offerings_crossListingId_index" ON schedule_builder.offerings USING btree ("crossListingId");

CREATE POLICY "public_read" ON "schedule_builder"."offerings"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."offerings" TO "anon", "authenticated", "postgres", "service_role";
