import "./events.css";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import PageHeader from "~/components/PageHeader";
import { TextLink } from "~/ui/text-link";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import { env } from "~/env";
import EventsSchedule from "./EventsSchedule";

export interface EventsPageProps {
  /**
   * Every meeting in the loaded window, ascending: a month back and forward as
   * far as the base goes. The list shows the ones that have not ended; the
   * calendar shows all of them.
   */
  meetings: MeetingInRange[];
  /** Past meetings, most recent first: the recent list and the archive dialog. */
  past: MeetingSummary[];
  /** Resolved once by the caller and threaded down. See `EventsBody`. */
  now: Date;
  today: { year: number; month: number; day: number } | null;
  bounds: {
    from: { year: number; month: number };
    to: { year: number; month: number };
  };
}

/**
 * The events page: the page head, then the schedule as a list or a month grid
 * (`events.html`, `events-month.html`). Every part is presentational and takes
 * data as props. `now` and `today` are resolved once by `EventsBody` so the
 * rows and the calendar cannot disagree about what day it is.
 *
 * No RSVP anywhere: members check in at the meeting, and the calendar actions
 * are Add to calendar and the feed.
 */
export default function EventsPage({
  meetings,
  past,
  now,
  today,
  bounds,
}: EventsPageProps) {
  const feedUrl = new URL("/events/calendar.ics", env.BASE_URL).toString();

  return (
    <>
      <PageHeader
        title="Events"
        head="brand"
        description={
          <>
            Merge Monday every week, special events on Wednesdays, and a social
            each month. You don&apos;t need to sign up to come; check in at the
            meeting with your UGA Google account.{" "}
            <TextLink asChild>
              <Link href="/#how-it-works">
                Weekly Programming <ArrowRightIcon weight="bold" />
              </Link>
            </TextLink>
          </>
        }
      />

      <div className="wrap ev-fill ev-wrap">
        <EventsSchedule
          meetings={meetings}
          past={past}
          now={now}
          today={today}
          bounds={bounds}
          feedUrl={feedUrl}
        />
      </div>
    </>
  );
}
