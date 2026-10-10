CREATE TABLE "platform"."reportReasons" (
  "title"       character varying(100) NOT NULL,
  "description" text,
  "position"    integer                NOT NULL
);

ALTER TABLE "platform"."reportReasons"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."reportReasons"
  ADD COLUMN "reason" platform."reportReason" NOT NULL;

ALTER TABLE "platform"."reportReasons"
  ADD CONSTRAINT "reportReasons_pkey" PRIMARY KEY (reason);

CREATE UNIQUE INDEX "reportReasons_position_idx" ON platform."reportReasons" USING btree ("position");

CREATE POLICY "authenticated_select" ON "platform"."reportReasons"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "deny_test_identities" ON "platform"."reportReasons"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))))
  WITH CHECK ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))));

CREATE POLICY "no_client_delete" ON "platform"."reportReasons"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reportReasons"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reportReasons"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reportReasons" TO "anon", "authenticated", "postgres", "service_role";
