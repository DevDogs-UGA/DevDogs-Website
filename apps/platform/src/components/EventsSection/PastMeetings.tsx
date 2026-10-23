import Link from "next/link";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { EVENT_TZ } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import type { MeetingSummary } from "~/server/loaders/meetings";
import { CANCELLED_LABEL, isCancelled, meetingCategory } from "./meetingView";

/**
 * The archive: the most recent nights that already happened, as a short list
 * in the aside (`events.html`, "Past meetings").
 *
 * The attendance count is the reason it earns a place. An officer typed
 * everything else on the events page; attendance is counted from check-ins the
 * platform holds itself, so it is the one number here nobody could have written
 * down. A cancelled night prints its status instead of a count: nobody checks
 * in to a meeting that did not happen, and a 0 would read as a night nobody
 * came to.
 *
 * Fetches and counts nothing: `attendanceCount` arrives on `MeetingSummary`
 * from a subquery in the loader.
 *
 * `moreCount` only says how many older nights exist. The page is cached and
 * reads no request state, so it cannot page on a search param; the count is
 * shown so the list does not pass itself off as the whole history.
 */

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: EVENT_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: EVENT_TZ,
});

export default function PastMeetings({
  meetings,
  moreCount = 0,
}: {
  /** Most recent first. */
  meetings: MeetingSummary[];
  moreCount?: number;
}) {
  return (
    <section id="past" aria-labelledby="past-meetings-heading">
      <div className="card-head">
        <h3 className="card-title" id="past-meetings-heading">
          Past meetings
        </h3>
      </div>
      {meetings.length === 0 ? (
        <p className="small muted">None yet this semester. Give it a Monday.</p>
      ) : (
        <div className="ev-past">
          {meetings.map((meeting) => {
            const cancelled = isCancelled(meeting);
            const where = locationLine(meeting.building, meeting.location);
            const detail = cancelled
              ? CANCELLED_LABEL
              : meeting.attendanceCount > 0
                ? `${meeting.attendanceCount} attended`
                : null;
            return (
              <Link
                key={meeting.id}
                href={`/events/${meeting.slug}`}
                data-kind={meetingCategory(meeting)}
              >
                <div className="d">
                  {MONTH.format(meeting.startsAt)}
                  <b>{DAY.format(meeting.startsAt)}</b>
                </div>
                <div>
                  <div className="t">{meetingTitle(meeting)}</div>
                  <div className="s">
                    {[where, detail].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {moreCount > 0 && (
        <p className="small muted ev-more">
          {moreCount === 1
            ? "1 older meeting is in the archive."
            : `${moreCount} older meetings are in the archive.`}
        </p>
      )}
    </section>
  );
}
