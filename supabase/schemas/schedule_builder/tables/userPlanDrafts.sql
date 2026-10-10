CREATE TABLE "schedule_builder"."userPlanDrafts" (
  "userId"            uuid                   NOT NULL,
  "academicPeriod"    integer                NOT NULL,
  "prefStartTime"     time without time zone,
  "prefEndTime"       time without time zone,
  "inputCampus"       character varying,
  "minCreditHours"    integer                NOT NULL DEFAULT 12,
  "maxCreditHours"    integer                NOT NULL DEFAULT 18,
  "showFilledClasses" boolean                NOT NULL DEFAULT false,
  CONSTRAINT "userPlanDrafts_pkey" PRIMARY KEY ("userId", "academicPeriod")
);

ALTER TABLE "schedule_builder"."userPlanDrafts"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_drafts" ON "schedule_builder"."userPlanDrafts"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = "userId"))
  WITH CHECK ((auth.uid() = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."userPlanDrafts" TO "anon", "authenticated", "postgres", "service_role";
