import { cacheLife, cacheTag } from "next/cache";
import EventsPage, { type EventsPageProps } from "./EventsPage";
import EventsUnavailable from "./EventsUnavailable";
import {
  addMonths,
  clubDay,
  clubMonthStart,
  scheduleWindow,
} from "~/lib/eventTime";
import {
  getFurthestMeetingStart,
  getMeetingsInRange,
  getPastMeetings,
  MEETINGS_TAG,
} from "~/server/loaders/meetings";

/**
 * The events page's content, shared by `/events` and `/events/directions`
 * (which is the same page with the directions drawer open over it).
 *
 * Catches its own read. The `try` is deliberately OUTSIDE the cached function
 * rather than inside it: catching within a `"use cache"` scope would make the
 * fallback the cached value, so one transient connection blip would serve "the
 * schedule could not be loaded" for the whole revalidate window to everybody.
 * Letting the throw escape the scope leaves nothing cached and the next
 * request tries again. (A thrown render error reaches `events/error.tsx` too,
 * now that the read lives in the page rather than a layout; the explicit catch
 * stays so the directions route degrades the same way.)
 */
export default async function EventsBody() {
  let data: EventsPageProps;
  try {
    data = await getSchedule();
  } catch {
    return <EventsUnavailable />;
  }
  return <EventsPage {...data} />;
}

/** How far back the archive dialog reaches. */
const ARCHIVE_LIMIT = 120;

/**
 * Everything time- and database-dependent about the page, resolved once.
 *
 * Tagged `MEETINGS_TAG`, which the config reconcile expires whenever it changes
 * a meeting (`revalidateMeetings`), so a config change shows at once. The
 * `cacheLife` is the backstop for what the tag can't see: "now" moving past a
 * meeting, and any write that doesn't go through the reconcile.
 *
 * Reading the clock is legal here because this IS a cache scope; the value is
 * resolved when the entry is built and handed down as data, so no component
 * below reads a clock and none of them can disagree about the date.
 */
async function getSchedule(): Promise<EventsPageProps> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });
  cacheTag(MEETINGS_TAG);

  const now = new Date();
  const today = clubDay(now);

  // A month back, and forward as far as the base actually goes. The arithmetic
  // lives in `scheduleWindow`, where it is testable.
  const furthest = await getFurthestMeetingStart();
  const { from, to } = scheduleWindow(today, furthest);

  const [meetings, past] = await Promise.all([
    getMeetingsInRange(clubMonthStart(from), clubMonthStart(to)),
    // The recent list and the archive dialog share one read: the dialog pages
    // through these in client state, since the cached page cannot read `?past`.
    getPastMeetings(ARCHIVE_LIMIT),
  ]);

  return {
    meetings,
    past,
    now,
    today,
    bounds: {
      from: { year: from.year, month: from.month },
      // Inclusive for the calendar's paging, so `to` names the last month a
      // reader can reach rather than the exclusive bound of the query.
      to: addMonths(to, -1),
    },
  };
}
