import { calendarEvent } from "~/lib/calendarEvent";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { meetingTitle } from "~/lib/meetingTitle";
import { env } from "~/env";
import {
  getMeetingBySlug,
  getMeetingWorkshops,
} from "~/server/loaders/meetings";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const meeting = await getMeetingBySlug(slug);

  if (meeting === null) {
    return new Response("Event not found", { status: 404 });
  }
  if (meeting.cancelledAt !== null) {
    return new Response("Event not found", { status: 404 });
  }

  const workshops = await getMeetingWorkshops(meeting.id);
  const base = env.BASE_URL.replace(/\/$/, "");
  const body = calendarEvent({
    id: meeting.id,
    title: meetingTitle(meeting, workshops),
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    location: locationLine(meeting.building, meeting.location),
    summary: meeting.summary,
    rsvpUrl: meeting.rsvpUrl,
    eventUrl: `${base}/events/${encodeURIComponent(meeting.slug)}`,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="devdogs-${meeting.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
