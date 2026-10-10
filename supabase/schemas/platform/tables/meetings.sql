CREATE TABLE "platform"."meetings" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"               text                     NOT NULL,
  "nameOverride"       text,
  "location"           text,
  "startsAt"           timestamp with time zone NOT NULL,
  "endsAt"             timestamp with time zone NOT NULL,
  "surveyUrl"          text,
  "deletedAt"          timestamp with time zone,
  "summary"            text,
  "kind"               text,
  "rsvpUrl"            text,
  "building"           text,
  "cancelledAt"        timestamp with time zone,
  "cancellationReason" text,
  "countsForCredit"    boolean                  NOT NULL DEFAULT false,
  "seasonId"           uuid,
  "surveyQuestionIds"  text[]                   NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT "meetings_building_choices"
    CHECK
    (((building IS NULL) OR (building = ANY (ARRAY['DLW'::text, 'Driftmier'::text, 'Plant Sciences'::text, 'Boyd'::text, 'MLC'::text, 'Science Learning Center'::text,
    'Science Library'::text, 'Poultry Science'::text, 'Main Library'::text, 'Tate'::text, 'Other'::text])))),
  CONSTRAINT "meetings_cancellationReason_length" CHECK ((("cancellationReason" IS NULL) OR (char_length("cancellationReason") <= 160))),
  CONSTRAINT "meetings_cancellationReason_needs_cancellation" CHECK ((("cancellationReason" IS NULL) OR ("cancelledAt" IS NOT NULL))),
  CONSTRAINT "meetings_endsAt_after_startsAt" CHECK (("endsAt" > "startsAt")),
  CONSTRAINT "meetings_kind_choices"
    CHECK (((kind IS NULL) OR (kind = ANY (ARRAY['Build Session'::text, 'Study Session'::text, 'Interest Meeting'::text, 'Social'::text, 'Demo Night'::text])))),
  CONSTRAINT "meetings_nameOverride_length" CHECK ((("nameOverride" IS NULL) OR (char_length("nameOverride") <= 80))),
  CONSTRAINT "meetings_pkey" PRIMARY KEY (id),
  CONSTRAINT "meetings_rsvpUrl_host" CHECK ((("rsvpUrl" IS NULL) OR ("rsvpUrl" ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(/[A-Za-z0-9/_?=&.%#:~-]*)?$'::text))),
  CONSTRAINT "meetings_slug_key" UNIQUE (slug),
  CONSTRAINT "meetings_summary_length" CHECK (((summary IS NULL) OR (char_length(summary) <= 240))),
  CONSTRAINT "meetings_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES platform.seasons(id) ON UPDATE CASCADE ON DELETE SET NULL
);

ALTER TABLE "platform"."meetings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX meetings_live_idx ON platform.meetings USING btree ("startsAt")
  WHERE ("deletedAt" IS NULL);

CREATE POLICY "no_client_delete" ON "platform"."meetings"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."meetings"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."meetings"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."meetings"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."meetings" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "platform"."meetings"."building" IS 'Which building this meeting is in, from the closed list the campus map can draw. Null means nobody has picked one; ''Other'' means somewhere the map does not cover, and the free-text "location" beside it carries the detail either way.';

COMMENT ON COLUMN "platform"."meetings"."cancellationReason" IS 'Why, in a few words -- "no sprint this week", "campus closed". Null even when "cancelledAt" is set, because the fact and the explanation arrive in separate keystrokes and the page can state the fact without it.';

COMMENT ON COLUMN "platform"."meetings"."cancelledAt" IS 'When this meeting was called off. Null is the ordinary case. Distinct from "deletedAt", which archives a row authored in error: a cancelled meeting is still shown -- struck through, with its reason -- on every surface that is a SCHEDULE, and hidden only from the surfaces that answer "where should I go now".';

COMMENT ON COLUMN "platform"."meetings"."kind" IS 'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, Social, or Demo Night. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';

COMMENT ON COLUMN "platform"."meetings"."location" IS 'Where inside "building" -- a room number or the name of a space. Free text, authored in config. Printed beside the building; never parsed to decide anything.';

COMMENT ON COLUMN "platform"."meetings"."nameOverride" IS 'A name for this night, when it has one worth reading -- "Cold Start", "Midterm Study Session". Null is the ORDINARY case: a sprint Monday derives its heading from its workshops and judging, and rendering a hand-written restatement of that beside it would be the same information twice from two sources. Authored in config as a meeting''s "title" -- irregular events only.';

COMMENT ON COLUMN "platform"."meetings"."rsvpUrl" IS 'HTTPS RSVP event page (Bevy, Involvement Network, or another event host); no userinfo.';

COMMENT ON COLUMN "platform"."meetings"."summary" IS 'One or two sentences about this meeting, authored in config. Null means none was written, and the events page shows a derived agenda instead. Capped at 240 characters; longer text fails the config validator rather than being truncated.';

COMMENT ON COLUMN "platform"."meetings"."surveyUrl" IS 'Where to send a member after a successful check-in at this meeting. Null is the ordinary case -- most nights have nothing to redirect to.';
