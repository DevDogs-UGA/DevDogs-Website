CREATE TABLE "platform"."supportConversations" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "threadId"            text                     NOT NULL,
  "userId"              uuid,
  "guestId"             uuid,
  "role"                text                     NOT NULL DEFAULT 'asker'::text,
  "lastReadMessageId"   text,
  "createdAt"           timestamp with time zone NOT NULL DEFAULT now(),
  "followedInDiscordAt" timestamp with time zone,
  CONSTRAINT "supportConversations_owner_check" CHECK ((("userId" IS NULL) <> ("guestId" IS NULL))),
  CONSTRAINT "supportConversations_pkey" PRIMARY KEY (id),
  CONSTRAINT "supportConversations_role_check" CHECK ((role = ANY (ARRAY['asker'::text, 'follower'::text]))),
  CONSTRAINT "supportConversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "supportConversations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES platform."supportGuests"(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."supportConversations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "supportConversations_guestId_idx" ON platform."supportConversations" USING btree ("guestId");

CREATE UNIQUE INDEX "supportConversations_thread_guest_idx" ON platform."supportConversations" USING btree ("threadId", "guestId")
  WHERE ("guestId" IS NOT NULL);

CREATE UNIQUE INDEX "supportConversations_thread_user_idx" ON platform."supportConversations" USING btree ("threadId", "userId")
  WHERE ("userId" IS NOT NULL);

CREATE INDEX "supportConversations_userId_idx" ON platform."supportConversations" USING btree ("userId");

CREATE POLICY "no_client_delete" ON "platform"."supportConversations"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."supportConversations"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."supportConversations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."supportConversations" TO "anon", "authenticated", "postgres", "service_role";
