import { loadBrandEvent, loadEvents } from "@devdogsuga/cli-core/repo/peers";
import type { Meeting, Workshop } from "@devdogsuga/events";
import type { EventGraphicSource } from "./graphics.js";

/**
 * Meetings, for the one group of graphics that cannot be drawn from files
 * alone.
 *
 * Every other graphic is a function of committed files. An event poster used
 * to be a function of meetings RECONCILED into the database from
 * `@devdogsuga/events` — which meant `devtools images event/*` needed a
 * running local stack just to draw a picture that comes entirely out of this
 * repo. It no longer does: `@devdogsuga/events`'s `getClubConfig()` is the
 * authored source those database rows were always reconciled FROM (see
 * `apps/platform/src/server/config/reconcile.ts` in the target repo), so
 * reading it directly here skips the round trip through Postgres rather than
 * duplicating it. {@link EventReader} is the seam the command talks to, so
 * tests never touch the filesystem or the network.
 */

/** The seam the command talks to, so tests never open a socket. */
export interface EventReader {
  meetings(): Promise<EventGraphicSource[]>;
}

/**
 * Builds the reader from `@devdogsuga/events`'s committed data file.
 *
 * Replaces `supabaseEvents`, which read the `meetings`/`workshops` tables a
 * reconcile job had already copied this same config into. The config's shape
 * (`schema.ts`) is deliberately a near-mirror of those tables' columns for
 * exactly this reason — see that file's header — so the mapping below is
 * closer to a rename than a translation: `Meeting.id` is the row's `slug`,
 * `Meeting.title` is what the DB called `nameOverride`, and a workshop's
 * `project` (free text in the config) stands in for the DB's
 * `projects.displayName` join.
 */
export function configEvents(): EventReader {
  return {
    async meetings() {
      const { getClubConfig } = await loadEvents();
      const { EVENT_SEGMENT_VISUALS, meetingCardDetail, meetingLocation } =
        await loadBrandEvent();

      // Newest first, matching the DB reader's `order("startsAt", {
      // ascending: false })` — the picker should offer the most recent
      // meeting first, not whatever order the config file happens to list
      // them in.
      const meetings = [...getClubConfig().meetings].sort(
        (a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt),
      );

      return meetings.map((row) => {
        const meeting = {
          slug: row.id,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
          building: row.building,
          location: row.location,
          kind: row.kind,
          cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
          cancellationReason: row.cancellationReason,
        };

        // No competitions here either, for the same reason `supabaseEvents`
        // dropped them: a competition is a mirrored GitHub issue now, not
        // config a meeting kicks off. Every agenda item is plain "workshop".
        const items: Array<{
          label: string;
          segment: keyof typeof EVENT_SEGMENT_VISUALS;
        }> = row.agenda.map((workshop) => ({
          label: workshopLabel(workshop),
          segment: "workshop",
        }));

        const detail = meetingCardDetail({
          meeting,
          title: meetingTitle(
            row.title,
            row.kind,
            meeting.startsAt,
            items.map((item) => item.label),
          ),
          agenda: items.map(
            (item) =>
              `${EVENT_SEGMENT_VISUALS[item.segment].label}: ${item.label}`,
          ),
          location: meetingLocation(row.building, row.location),
        });

        return {
          slug: row.id,
          hint: describeMeeting(meeting),
          detail,
          items: items.map((item) => {
            const visual = EVENT_SEGMENT_VISUALS[item.segment];
            return {
              stem: slugPart(item.label),
              detail: {
                ...detail,
                title: item.label,
                agenda: undefined,
                badge: { label: visual.label, accent: visual.accent },
              },
            };
          }),
        };
      });
    },
  };
}

/** A readable path component for a workshop card. */
function slugPart(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agenda-item"
  );
}

/** Unlike the old DB `WorkshopRow`, `Workshop.title` is non-nullable in the
 * config schema (`workshopSchema`), so there is no `projects.displayName`
 * fallback left to reach for. */
function workshopLabel(row: Workshop): string {
  return row.title;
}

/**
 * The meeting's name, in descending order of how much somebody meant it.
 *
 * Mirrors `apps/platform/src/lib/meetingTitle.ts`: an authored name, then the
 * kind, then the workshops it teaches, then the date. Two named workshops read
 * as a heading; three do not, and the date carries it while the agenda below
 * shows the detail.
 *
 * Duplicated rather than imported because it lives in the Next app, which this
 * package cannot depend on. `events.test.ts` pins the chain so a change to one
 * shows up as a failure rather than as a differently-titled poster.
 */
export function meetingTitle(
  nameOverride: string | null,
  kind: Meeting["kind"],
  startsAt: Date,
  agenda: readonly string[],
): string {
  if (nameOverride !== null) return nameOverride;
  if (kind !== null) return kind;
  if (agenda.length === 1) return `Workshop: ${agenda[0]}`;
  if (agenda.length === 2) return `Workshop: ${agenda[0]} & ${agenda[1]}`;

  return startsAt.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "long",
  });
}

/** One line for the picker: when it is, and whether it is still on. */
function describeMeeting(meeting: {
  startsAt: Date;
  cancelledAt: Date | null;
}): string {
  const when = meeting.startsAt.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
  });

  return meeting.cancelledAt === null ? when : `${when}, cancelled`;
}
