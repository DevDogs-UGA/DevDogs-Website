import { calendarFeed } from "~/lib/calendarEvent";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { meetingTitle } from "~/lib/meetingTitle";
import { env } from "~/env";
import { clubDay, clubMonthStart, scheduleWindow } from "~/lib/eventTime";
import {
  getFurthestMeetingStart,
  getMeetingsInRange,
} from "~/server/loaders/meetings";

/** The live subscription feed. It includes the prior month so a cancellation
 * can still update a calendar client shortly after the scheduled date. */
export async function GET() {
  const furthest = await getFurthestMeetingStart();
  const { from, to } = scheduleWindow(clubDay(new Date()), furthest);
  const meetings = await getMeetingsInRange(
    clubMonthStart(from),
    clubMonthStart(to),
  );
  const base = env.BASE_URL.replace(/\/$/, "");

  const body = calendarFeed(
    meetings.map((meeting) => ({
      id: meeting.id,
      title: meetingTitle(meeting, meeting.workshops),
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      location: locationLine(meeting.building, meeting.location),
      summary: meeting.summary,
      rsvpUrl: meeting.rsvpUrl,
      eventUrl: `${base}/events/${encodeURIComponent(meeting.slug)}`,
      cancelled: meeting.cancelledAt !== null,
    })),
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="devdogs-events.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
