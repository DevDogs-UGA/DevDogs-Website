/** Escape user-authored text for an iCalendar TEXT value. */
function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

/** iCalendar timestamps are UTC, which avoids embedding a brittle timezone definition. */
function timestamp(value: Date): string {
  return value
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Fold content lines at the RFC 5545 limit without splitting a UTF-8 character. */
function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let part = "";

  for (const character of line) {
    const limit = folded.length === 0 ? 75 : 74;
    if (encoder.encode(part + character).byteLength > limit) {
      folded.push(folded.length === 0 ? part : ` ${part}`);
      part = character;
    } else {
      part += character;
    }
  }
  folded.push(folded.length === 0 ? part : ` ${part}`);
  return folded;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  summary: string | null;
  rsvpUrl: string | null;
  eventUrl: string;
  cancelled?: boolean;
}

type CalendarLinkEvent = Omit<CalendarEvent, "id">;

function description({
  summary,
  rsvpUrl,
  eventUrl,
}: CalendarLinkEvent): string {
  return [summary, `Event details: ${eventUrl}`, rsvpUrl && `RSVP: ${rsvpUrl}`]
    .filter((line): line is string => line !== null)
    .join("\n\n");
}

/** Prefilled web-calendar composers; ICS remains the provider-neutral fallback. */
export function calendarLinks(event: CalendarLinkEvent): {
  google: string;
  outlook: string;
} {
  const details = description(event);
  const google = new URL("https://calendar.google.com/calendar/render");
  google.search = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${timestamp(event.startsAt)}/${timestamp(event.endsAt)}`,
    details,
    ...(event.location === null ? {} : { location: event.location }),
  }).toString();

  const outlook = new URL(
    "https://outlook.live.com/calendar/0/deeplink/compose",
  );
  outlook.search = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.startsAt.toISOString(),
    enddt: event.endsAt.toISOString(),
    body: details,
    ...(event.location === null ? {} : { location: event.location }),
  }).toString();

  return { google: google.toString(), outlook: outlook.toString() };
}

/** A portable single-event calendar file for Apple, Outlook, and other clients. */
export function calendarEvent({
  id,
  title,
  startsAt,
  endsAt,
  location,
  summary,
  rsvpUrl,
  eventUrl,
  cancelled,
}: CalendarEvent): string {
  return calendarFeed([
    {
      id,
      title,
      startsAt,
      endsAt,
      location,
      summary,
      rsvpUrl,
      eventUrl,
      cancelled,
    },
  ]);
}

/** A subscribable calendar whose stable event UIDs let clients apply updates. */
export function calendarFeed(events: CalendarEvent[]): string {
  const generatedAt = timestamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DevDogs UGA//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:DevDogs Events",
    ...events.flatMap((event) => {
      const eventDescription = description(event);
      return [
        "BEGIN:VEVENT",
        `UID:${escapeText(event.id)}@devdogsuga.org`,
        `DTSTAMP:${generatedAt}`,
        `DTSTART:${timestamp(event.startsAt)}`,
        `DTEND:${timestamp(event.endsAt)}`,
        `SUMMARY:${escapeText(event.title)}`,
        `DESCRIPTION:${escapeText(eventDescription)}`,
        `URL:${event.eventUrl}`,
        ...(event.location === null
          ? []
          : [`LOCATION:${escapeText(event.location)}`]),
        ...(event.cancelled ? ["STATUS:CANCELLED"] : []),
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}
