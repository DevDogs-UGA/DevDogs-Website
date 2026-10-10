CREATE TABLE "platform"."rateLimitHits" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scope"     text                     NOT NULL,
  "subjectId" uuid                     NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rateLimitHits_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."rateLimitHits"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "rateLimitHits_scope_subject_createdAt_idx" ON platform."rateLimitHits" USING btree (scope, "subjectId", "createdAt" DESC);

CREATE POLICY "no_client_delete" ON "platform"."rateLimitHits"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."rateLimitHits"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."rateLimitHits"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."rateLimitHits" TO "anon", "authenticated", "postgres", "service_role";
