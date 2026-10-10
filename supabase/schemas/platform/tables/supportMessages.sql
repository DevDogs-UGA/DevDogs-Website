CREATE TABLE "platform"."supportMessages" (
  "messageId" text                     NOT NULL,
  "threadId"  text                     NOT NULL,
  "userId"    uuid,
  "guestId"   uuid,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supportMessages_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES platform."supportGuests"(id) ON DELETE SET NULL,
  CONSTRAINT "supportMessages_pkey" PRIMARY KEY ("messageId"),
  CONSTRAINT "supportMessages_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."supportMessages"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "supportMessages_threadId_idx" ON platform."supportMessages" USING btree ("threadId");

CREATE POLICY "no_client_delete" ON "platform"."supportMessages"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."supportMessages"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."supportMessages"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."supportMessages" TO "anon", "authenticated", "postgres", "service_role";
