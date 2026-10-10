CREATE TABLE "platform"."seasons" (
  "id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"     text                     NOT NULL,
  "startsAt" timestamp with time zone NOT NULL,
  "endsAt"   timestamp with time zone NOT NULL,
  CONSTRAINT "seasons_endsAt_after_startsAt" CHECK (("endsAt" > "startsAt")),
  CONSTRAINT "seasons_name_key" UNIQUE (name),
  CONSTRAINT "seasons_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."seasons"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "seasons_startsAt_idx" ON platform.seasons USING btree ("startsAt");

CREATE POLICY "no_client_delete" ON "platform"."seasons"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."seasons"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."seasons"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."seasons"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."seasons" TO "anon", "authenticated", "postgres", "service_role";
