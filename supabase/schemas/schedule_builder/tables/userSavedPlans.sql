CREATE TABLE "schedule_builder"."userSavedPlans" (
  "id"             uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "userId"         uuid                        NOT NULL,
  "academicPeriod" integer                     NOT NULL,
  "title"          character varying           NOT NULL,
  "crns"           integer[]                   NOT NULL,
  "pinned"         boolean                     NOT NULL DEFAULT false,
  "createdAt"      timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt"      timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "userSavedPlans_pkey" PRIMARY KEY (id)
);

ALTER TABLE "schedule_builder"."userSavedPlans"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_plans" ON "schedule_builder"."userSavedPlans"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = "userId"))
  WITH CHECK ((auth.uid() = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."userSavedPlans" TO "anon", "authenticated", "postgres", "service_role";
