CREATE TABLE "platform"."supportGuests" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash"  text                     NOT NULL,
  "label"      text                     NOT NULL,
  "blockedAt"  timestamp with time zone,
  "createdAt"  timestamp with time zone NOT NULL DEFAULT now(),
  "lastSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supportGuests_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."supportGuests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "supportGuests_lastSeenAt_idx" ON platform."supportGuests" USING btree ("lastSeenAt");

CREATE UNIQUE INDEX "supportGuests_tokenHash_idx" ON platform."supportGuests" USING btree ("tokenHash");

CREATE POLICY "no_client_delete" ON "platform"."supportGuests"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."supportGuests"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."supportGuests"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."supportGuests" TO "anon", "authenticated", "postgres", "service_role";
