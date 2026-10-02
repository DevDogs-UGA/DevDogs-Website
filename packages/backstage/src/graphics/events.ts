import {
  EVENT_SEGMENT_VISUALS,
  meetingCardDetail,
  meetingLocation,
} from "@devdogsuga/brand/event";
import { getClubConfig, type Meeting, type Workshop } from "@devdogsuga/events";
import type { EventGraphicSource } from "./registry.js";

/**
 * Meetings, for the one group of graphics that cannot be drawn from files
 * alone.
 *
 * Every other graphic is a function of the brand package. An event poster is a
 * function of the club's meetings, which `@devdogsuga/events` publishes as its
 * committed config, so reading it directly needs no checkout, no database and
 * no running stack. {@link EventReader} is the seam the command talks to, so
 * tests never read the real schedule.
 */

/** The seam the command talks to, so tests never read the real schedule. */
export interface EventReader {
  meetings(): Promise<EventGraphicSource[]>;
}

/**
 * Builds the reader from `@devdogsuga/events`'s committed data file.
 *
 * `Meeting.slug` is the card's `slug` (its platform URL) and `Meeting.title` is its authored name
 * (`nameOverride` on the platform's meetings table).
 */
export function configEvents(): EventReader {
  return {
    async meetings() {
      // Newest first: the picker should offer the most recent meeting first,
      // not whatever order the config file happens to list them in.
      const meetings = [...getClubConfig().meetings].sort(
        (a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt),
      );

      return meetings.map((row) => {
        const meeting = {
          slug: row.slug,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
          building: row.building,
          location: row.location,
          kind: row.kind,
          cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
          cancellationReason: row.cancellationReason,
        };

        // No competitions: a competition is a mirrored GitHub issue, not
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
          slug: row.slug,
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

/** `Workshop.title` is non-nullable in the config schema (`workshopSchema`). */
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
 * package cannot depend on. `graphics.test.ts` pins the chain so a change to one
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
