CREATE TABLE "schedule_builder"."userPreferences" (
  "userId"                uuid    NOT NULL,
  CONSTRAINT "userPreferences_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "schedule_builder"."userPreferences"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_prefs" ON "schedule_builder"."userPreferences"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = "userId"))
  WITH CHECK ((auth.uid() = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."userPreferences" TO "anon", "authenticated", "postgres", "service_role";
