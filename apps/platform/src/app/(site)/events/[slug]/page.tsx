import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cancellationNotice } from "~/components/EventsSection/meetingView";
import MeetingDetail from "~/components/EventsSection/MeetingDetail";
import { meetingTitle } from "~/lib/meetingTitle";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { formatEventSpan } from "~/lib/eventTime";
import {
  getMeetingBySlug,
  getMeetingWorkshops,
  getUpcomingMeetings,
} from "~/server/loaders/meetings";

/**
 * Per-meeting metadata, because this URL is made to be handed around.
 *
 * Pasted into Discord or an announcement, an unfurl reading "Events | DevDogs"
 * tells nobody which night they are being invited to. Title carries the name,
 * description the two facts that decide whether somebody comes: when, and
 * where.
 */
export async function generateMetadata({
  params,
}: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);

  // A dead link still gets unfurled, so it gets an honest card rather than
  // whatever the parent layout's title happens to be.
  if (!meeting) {
    return {
      title: "Meeting not found | DevDogs",
      description: "No meeting on the DevDogs schedule matches this link.",
    };
  }

  const span = formatEventSpan(meeting.startsAt, meeting.endsAt);

  const where = locationLine(meeting.building, meeting.location);

  // ⚠️ The unfurl is the most-read thing this page produces, and it was the
  // last one still saying the meeting was on.
  //
  // A cancelled night keeps its URL rather than 404ing because the link is
  // already in Discord and people walk over anyway. That link renders as a card
  // carrying exactly these two fields, so the card sitting in the channel went
  // on advertising a 6:00 to 8:00 PM meeting in DLW 124 for a night the club
  // had called off.
  //
  // The room is dropped along with the hour: both are instructions to go
  // somewhere, and neither survives the cancellation.
  const notice = cancellationNotice(meeting);
  const description = notice ?? (where ? `${span} — ${where}` : span);

  return {
    // Derived rather than read: `nameOverride` is null for most nights, and
    // the naive version would put " | DevDogs" in the tab and in every link
    // preview. `generateMetadata` deliberately does not load the agenda for
    // this, so the title falls back through the kind to the date. One query is
    // not worth a richer tab.
    title: `${meetingTitle(meeting)} | DevDogs`,
    description,
  };
}

/**
 * /events/[slug], one meeting, as a full page (`event-detail.html`). The page
 * itself only loads; `MeetingDetail` draws it, so every state of it (upcoming,
 * happening now, ended, cancelled) can be rendered from plain props.
 */
export default async function MeetingPage({
  params,
}: PageProps<"/events/[slug]">) {
  // The page compares against now: whether the meeting is on, how far off it
  // is. `connection()` opts the segment out of prerendering so those are
  // answered for this request rather than frozen at build time.
  await connection();

  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);
  if (!meeting) notFound();

  const [workshops, upcoming] = await Promise.all([
    getMeetingWorkshops(meeting.id),
    getUpcomingMeetings(5),
  ]);

  return (
    <MeetingDetail
      slug={slug}
      meeting={meeting}
      workshops={workshops}
      upcoming={upcoming}
      // Read once and threaded through everything below, so the questions that
      // depend on it (happening now, ended) cannot disagree because the clock
      // ticked between them. Legal in render only because of `connection()`.
      now={new Date()}
    />
  );
}
