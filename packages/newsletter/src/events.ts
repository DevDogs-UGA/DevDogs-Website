/**
 * Newsletter events, read from the club config (`@devdogsuga/events`) instead
 * of restated per issue.
 *
 * The config is the one place a meeting's date, room and RSVP link are
 * authored, so an issue names meetings by their config id and everything the
 * card draws is derived here. What stays per issue is only what the config
 * has no field for: a chip label for a night the calendar has no kind for
 * ("Kickoff"), or copy written for the email rather than the site.
 */
import {
  EVENT_TZ,
  eventKindVisual,
  meetingLocation,
} from "@devdogsuga/brand/event";
import { getClubConfig, type Meeting } from "@devdogsuga/events";
import type { ChangelogEvent } from "./issues.js";
import { KIND } from "./theme.js";

let meetings: ReadonlyMap<string, Meeting> | undefined;

function meetingById(id: string): Meeting {
  meetings ??= new Map(getClubConfig().meetings.map((m) => [m.id, m]));
  const meeting = meetings.get(id);
  if (meeting === undefined) {
    throw new Error(`No meeting "${id}" in the club config.`);
  }
  return meeting;
}

function part(at: Date, options: Intl.DateTimeFormatOptions): string {
  return at.toLocaleString("en-US", { timeZone: EVENT_TZ, ...options });
}

/** `"6:00 – 7:30 PM"`, or `"11:00 AM – 1:00 PM"` across noon. */
function timeRange(startsAt: Date, endsAt: Date): string {
  const clock = (at: Date) =>
    part(at, { hour: "numeric", minute: "2-digit" }).split(" ") as [
      string,
      string,
    ];
  const [start, startMeridiem] = clock(startsAt);
  const [end, endMeridiem] = clock(endsAt);
  return startMeridiem === endMeridiem
    ? `${start} – ${end} ${endMeridiem}`
    : `${start} ${startMeridiem} – ${end} ${endMeridiem}`;
}

/** A night with no kind is a workshop night when it teaches something. */
function chipFor(meeting: Meeting): { chip: string; color: string } {
  const visual = eventKindVisual(meeting.kind ?? undefined);
  if (meeting.kind !== null && visual !== undefined) {
    return { chip: meeting.kind, color: visual.accent };
  }
  return { chip: "Workshop", color: KIND.workshop };
}

/**
 * One meeting from the club config, as a newsletter card. `overrides` takes
 * precedence field by field; `blurb` is required from one or the other,
 * because a card with no copy is a mistake, not a layout.
 */
export function configEvent(
  id: string,
  overrides: Partial<ChangelogEvent> = {},
): ChangelogEvent {
  const meeting = meetingById(id);
  const startsAt = new Date(meeting.startsAt);
  const endsAt = new Date(meeting.endsAt);

  const blurb = overrides.blurb ?? meeting.summary;
  if (blurb === null) {
    throw new Error(
      `Meeting "${id}" has no summary in the club config; pass a blurb.`,
    );
  }
  if (meeting.title === null && overrides.title === undefined) {
    throw new Error(
      `Meeting "${id}" has no title in the club config; pass a title.`,
    );
  }

  return {
    ...chipFor(meeting),
    title: meeting.title ?? "",
    dow: part(startsAt, { weekday: "short" }).toUpperCase(),
    date: part(startsAt, { month: "short", day: "numeric" }),
    time: timeRange(startsAt, endsAt),
    loc: meetingLocation(meeting.building, meeting.location) ?? "TBA",
    rsvp: meeting.rsvpUrl,
    ...overrides,
    blurb,
  };
}
