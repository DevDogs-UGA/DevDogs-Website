CREATE TABLE "platform"."workshops" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "meetingId"   uuid                     NOT NULL,
  "project"     text,
  "deletedAt"   timestamp with time zone,
  "title"       text,
  "description" text,
  CONSTRAINT "workshops_description_length" CHECK (((description IS NULL) OR (char_length(description) <= 280))),
  CONSTRAINT "workshops_id_meetingId_key" UNIQUE (id, "meetingId"),
  CONSTRAINT "workshops_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "workshops_pkey" PRIMARY KEY (id),
  CONSTRAINT "workshops_title_length" CHECK (((title IS NULL) OR (char_length(title) <= 80)))
);

ALTER TABLE "platform"."workshops"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workshops_live_idx ON platform.workshops USING btree ("meetingId")
  WHERE ("deletedAt" IS NULL);

CREATE POLICY "no_client_delete" ON "platform"."workshops"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."workshops"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."workshops"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."workshops"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."workshops" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "platform"."workshops"."description" IS 'One or two sentences on what this workshop teaches, shown in the meeting''s detail dialog. Null renders nothing. Workshops are self-contained and assume no prior work, which is the single most useful thing a prospective member can learn here -- so this is worth writing even when the title is self-explanatory.';

COMMENT ON COLUMN "platform"."workshops"."project" IS 'The long-running body of work this workshop recommends, as free text -- "DogDays", "DogDays & DogPack" -- or null when it teaches a skill rather than a codebase. Authored in config; there is no projects table to look this up in any more.';

COMMENT ON COLUMN "platform"."workshops"."title" IS 'What this workshop is called, in the officers'' own vocabulary -- "Supabase", "Next.js", "Career Fair Readiness". Null falls back to "project", so every workshop authored before this column keeps rendering exactly as it did.';
