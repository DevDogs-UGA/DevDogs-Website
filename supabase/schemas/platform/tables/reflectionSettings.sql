CREATE TABLE "platform"."reflectionSettings" (
  "id"                   boolean                  NOT NULL DEFAULT true,
  "minimumWordCount"     integer                  NOT NULL DEFAULT 100,
  "submissionWindowDays" integer                  NOT NULL DEFAULT 7,
  "updatedAt"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reflectionSettings_minimumWordCount_positive" CHECK (("minimumWordCount" > 0)),
  CONSTRAINT "reflectionSettings_pkey" PRIMARY KEY (id),
  CONSTRAINT "reflectionSettings_singleton" CHECK (id),
  CONSTRAINT "reflectionSettings_submissionWindowDays_positive" CHECK (("submissionWindowDays" > 0))
);

ALTER TABLE "platform"."reflectionSettings"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_delete" ON "platform"."reflectionSettings"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reflectionSettings"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reflectionSettings"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reflectionSettings" TO "anon", "authenticated", "postgres", "service_role";
