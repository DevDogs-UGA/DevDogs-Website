import { z } from "zod";

/**
 * The shape of the club's meetings and workshops, authored as versioned data
 * rather than edited through a UI.
 *
 * This is the STRUCTURAL half of "is this config good". A file that parses
 * against this schema has the right shape and types; whether its CONTENT can
 * go on a public page -- a summary that fits its card, an RSVP link on the
 * club's own host -- is `validator.ts`'s job, run separately by `check.ts` so
 * a shape error and a publishability error are never confused for each
 * other in the CI output.
 *
 * Mirrors the columns `meetings` and `workshops` actually read today. Left
 * out on purpose: everything that exists only for a synced wire format --
 * a foreign record id, sync-status bookkeeping, attendance counts. Config has
 * no such plumbing: identity is the authored `id` itself, and there is
 * nothing to write status back onto -- a bad file simply fails CI.
 */

// ── Shared constants ─────────────────────────────────────────────────────────
//
// Duplicated from the baseline migration's check constraints rather than
// imported from it, so this package can be validated with no database in
// reach. The numbers must keep agreeing with the check constraints in
// `supabase/migrations/20260829040000_11_platform_events_core.sql` -- this
// file must never be STRICTER than that one: config is upstream of Postgres,
// so a config file this validator accepts must never be a row Postgres
// rejects.

/** Roughly two sentences, what the events card is laid out for. */
export const MEETING_SUMMARY_MAX_LENGTH = 240;
/** A single line in a schedule row and in a dialog title. */
export const MEETING_TITLE_MAX_LENGTH = 80;
/** Shorter than the summary cap: renders inline beside a struck-through row. */
export const MEETING_CANCELLATION_REASON_MAX_LENGTH = 160;
/** A schedule row's worth of text. */
export const WORKSHOP_TITLE_MAX_LENGTH = 80;
/** What the meeting's detail dialog lays out for a workshop's description. */
export const WORKSHOP_DESCRIPTION_MAX_LENGTH = 280;

/**
 * Rendered as an href on a public page under the club's name, so the host is
 * allowlisted rather than just the scheme. Mirrors the DB's
 * `meetings_rsvpUrl_host` check constraint. Adding a host here means
 * widening that check constraint in the same change.
 */
export const RSVP_URL_ALLOWED_HOSTS: readonly string[] = ["uga.campuslabs.com"];

/**
 * Exact mirror of the DB's `meetings_rsvpUrl_host` check constraint --
 * literally, not just semantically. `new URL(url).hostname` falls into
 * precisely the trap that check constraint's comment warns about: it parses
 * `http://uga.campuslabs.com/x` (wrong scheme) and
 * `https://someone@uga.campuslabs.com/x` (userinfo) happily, and both
 * hostnames land on the allowlist even though Postgres's regex rejects both
 * strings outright. Testing this pattern directly against the whole URL,
 * the same way the check constraint does, means there is nothing left for
 * `new URL()` to get cleverer about behind this validator's back -- and it
 * stays true even if `RSVP_URL_ALLOWED_HOSTS` grows a second host.
 */
export const RSVP_URL_PATTERN = new RegExp(
  `^https://(${RSVP_URL_ALLOWED_HOSTS.map((host) =>
    host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})(/[A-Za-z0-9/_?=&.%#:~-]*)?$`,
);

/** Mirrors `meetings_kind_choices`. */
export const MEETING_KIND_CHOICES = [
  "Build Session",
  "Study Session",
  "Interest Meeting",
  "Social",
  "Demo Night",
] as const;

/** Mirrors `meetings_building_choices`. */
export const MEETING_BUILDING_CHOICES = [
  "DLW",
  "Driftmier",
  "Plant Sciences",
  "Boyd",
  "MLC",
  "Science Learning Center",
  "Science Library",
  "Poultry Science",
  "Main Library",
  "Tate",
  "Other",
] as const;

/**
 * The id pattern every meeting and workshop must match: a slug the
 * validator's uniqueness check and a URL can both trust.
 *
 * Permissive by design, because two very different shapes of id have to fit
 * it. A migrated row keeps its old Airtable record id verbatim ("recXXX...")
 * so the reconcile can match the existing database row created during that
 * migration; a new item gets a human slug ("cold-start-2026") instead. Both
 * are letters, digits and dashes with no leading or trailing dash, which is
 * also exactly what makes an id safe to put in a URL unescaped.
 */
export const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/**
 * A meeting's slug: its Eastern date, plus a lowercase descriptor when it
 * shares the date with another meeting ("2026-10-05-judging").
 *
 * This is the meeting's address on the platform (`/events/<slug>`) and on
 * every poster. The platform takes it from here verbatim, so it is authored,
 * reviewed and printed in one place rather than derived in two. Changing one
 * changes a URL people may already have. The leading date also keeps a
 * slug clear of the static routes beside it (`/events/directions`).
 */
export const MEETING_SLUG_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

// ── Schema ───────────────────────────────────────────────────────────────────

const stableId = z
  .string()
  .min(1)
  .regex(ID_PATTERN, "must be letters, digits and dashes only (a slug)");

/** A ISO-8601 instant. Validated as a string parseable by `Date`, rather than
 * with zod's own `.datetime()`, so the format tolerates whatever an author's
 * editor or a future generator happens to emit -- an offset, a `Z`, optional
 * fractional seconds -- as long as `new Date(value)` can make sense of it. */
const isoInstant = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "must be a valid ISO-8601 datetime",
  );

/**
 * A workshop: one of several sessions running in parallel at a meeting.
 *
 * `project` is free text, deliberately -- see the migration note on the
 * dropped `workshops.projectId` column and the `projects` table it pointed
 * at. A workshop recommends a body of work in words now ("DogDays", "DogDays
 * & DogPack"), the same way an officer would say it out loud, with nothing to
 * keep in sync.
 */
export const workshopSchema = z.strictObject({
  id: stableId.meta({
    description: "Permanent id, unique across the whole file. A slug.",
  }),
  title: z
    .string()
    .min(1)
    .max(WORKSHOP_TITLE_MAX_LENGTH)
    .meta({ description: "One schedule row's worth." }),
  description: z
    .string()
    .max(WORKSHOP_DESCRIPTION_MAX_LENGTH)
    .nullable()
    .meta({ description: "Shown in the meeting's detail dialog." }),
  project: z.string().min(1).nullable().meta({
    description: 'The work it recommends, in words ("DogDays & DogPack").',
  }),
});

export type Workshop = z.infer<typeof workshopSchema>;

/**
 * A meeting: the in-person moment. Its agenda is the workshops running that
 * night, authored inline rather than cross-referenced, because a workshop
 * belongs to exactly one meeting and nothing else in the config ever needs
 * to point at one independently.
 */
export const meetingSchema = z
  .strictObject({
    id: stableId.meta({
      description:
        "Permanent id, unique across the whole file: a slug for a new meeting, or the old Airtable record id.",
    }),
    slug: z
      .string()
      .regex(
        MEETING_SLUG_PATTERN,
        'must be the Eastern date, optionally with a lowercase descriptor ("2026-10-05-judging")',
      )
      .meta({
        description:
          "The meeting's URL on the platform and its posters: its Eastern date (YYYY-MM-DD), plus a lowercase descriptor when another meeting shares the date. Unique across the file.",
      }),
    // Title, summary and location are required even though their columns
    // are nullable: every meeting is also a newsletter card, and a card needs
    // a heading, copy and a place ("TBA" until there is one). Stricter than
    // the database is allowed; looser is not.
    title: z.string().min(1).max(MEETING_TITLE_MAX_LENGTH).meta({
      description: "The heading on the events page and newsletter card.",
    }),
    summary: z
      .string()
      .min(1)
      .max(MEETING_SUMMARY_MAX_LENGTH)
      .meta({ description: "About two sentences, for the events card." }),
    kind: z
      .enum(MEETING_KIND_CHOICES)
      .nullable()
      .meta({ description: "The kind of night, or null for a one-off." }),
    building: z.enum(MEETING_BUILDING_CHOICES).nullable(),
    location: z
      .string()
      .min(1)
      .meta({ description: 'The room, or "TBA" until there is one.' }),
    startsAt: isoInstant.meta({
      description:
        "ISO 8601 instant, e.g. 2026-09-14T22:00:00.000Z (6 PM Eastern).",
    }),
    endsAt: isoInstant.meta({
      description: "ISO 8601 instant, after startsAt.",
    }),
    rsvpUrl: z.url().nullable().meta({
      description: "The Involvement Network event page (uga.campuslabs.com).",
    }),
    cancelledAt: isoInstant
      .nullable()
      .meta({ description: "When it was cancelled; null while it is on." }),
    cancellationReason: z
      .string()
      .max(MEETING_CANCELLATION_REASON_MAX_LENGTH)
      .nullable()
      .meta({
        description: "Shown beside the struck-through row. Needs cancelledAt.",
      }),
    /** The one flag that governs both star credit and EL eligibility -- see
     * the migration note on `meetings.countsForCredit`. */
    countsForCredit: z.boolean().meta({
      description:
        "Whether checking in earns a star and counts toward EL credit.",
    }),
    /** Where to send a member after a successful check-in. Null is the
     * ordinary case: most nights have nothing to redirect to. */
    surveyUrl: z.url().nullable().meta({
      description: "An outside survey linked after check-in; usually null.",
    }),
    /** This meeting's survey: meeting-scoped question ids from
     * `questions.json`, asked in this order after check-in. Member-scoped
     * questions are asked everywhere and never listed. */
    questions: z.array(z.string()).optional().meta({
      description:
        "Ids of meeting-scoped questions from questions.json to ask after check-in, in order.",
    }),
    agenda: z
      .array(workshopSchema)
      .meta({ description: "The workshops running that night." }),
  })
  .refine((meeting) => new Date(meeting.endsAt) > new Date(meeting.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export type Meeting = z.infer<typeof meetingSchema>;

export const clubConfigSchema = z.strictObject({
  /** The editor's pointer to `meetings.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  meetings: z.array(meetingSchema),
});

export type ClubConfig = z.infer<typeof clubConfigSchema>;
