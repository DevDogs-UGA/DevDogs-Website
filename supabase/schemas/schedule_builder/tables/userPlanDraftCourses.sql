CREATE TABLE "schedule_builder"."userPlanDraftCourses" (
  "id"             uuid      NOT NULL DEFAULT gen_random_uuid(),
  "userId"         uuid      NOT NULL,
  "academicPeriod" integer   NOT NULL,
  "courseId"       integer   NOT NULL,
  "excludedCrns"   integer[] NOT NULL DEFAULT '{}'::integer[],
  CONSTRAINT "userPlanDraftCourses_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES schedule_builder.courses(id),
  CONSTRAINT "userPlanDraftCourses_pkey" PRIMARY KEY (id),
  CONSTRAINT "userPlanDraftCourses_userId_academicPeriod_courseId_unique" UNIQUE ("userId", "academicPeriod", "courseId")
);

ALTER TABLE "schedule_builder"."userPlanDraftCourses"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_draft_courses" ON "schedule_builder"."userPlanDraftCourses"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = "userId"))
  WITH CHECK ((auth.uid() = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "schedule_builder"."userPlanDraftCourses"
  TO "anon", "authenticated", "postgres", "service_role";
