import { cache } from "react";
import { getMeetingsInRange } from "~/server/loaders/meetings";
import type { MeetingInRange } from "~/server/loaders/meetings";
import NextMeetingStrip, { MeetingRow } from "./NextMeetingStrip";

/**
 * How many meetings the homepage names: the lead card plus the rows under the
 * Events heading. Four is a glance; the schedule is for the rest.
 */
const HOME_COUNT = 4;

/**
 * One read for both halves of the page. The lead card (under the hero) and the
 * list (in Events) are separate elements because they sit in different
 * sections, but they describe the same few nights, so they share a request's
 * answer instead of asking twice.
 */
const upcoming = cache(() => nextMeetings(HOME_COUNT));

/**
 * The lead card under the hero: the soonest meeting that has not ended.
 *
 * Standalone components, called from `page.tsx` OUTSIDE `HomeSections`'s
 * `"use cache"` scope, rather than awaited inline inside the sections. They
 * read "now" and the live schedule -- genuinely dynamic, per-request data --
 * and this deployment runs `"use cache"` without Cache Components/PPR (see
 * `next.config.ts`), which has no mechanism to carve a per-request hole out of
 * a cached subtree: everything a `"use cache"` function touches gets baked into
 * its single shared cache entry, including whichever request's database
 * connection happened to populate it. A live Hyperdrive/postgres.js connection
 * is scoped to the request that opened it (see `~/server/db`'s `currentDb`), so
 * once the cached entry outlives that request -- or a second concurrent
 * request shares its population -- Workers refuses the socket write with
 * "Cannot perform I/O on behalf of a different request", which is what threw
 * here before this split (surfaced to the browser as React errors #419/#441).
 *
 * Rendering these elements in `page.tsx` and passing them into `HomeSections`
 * as props keeps their data fetch on the current request the whole way
 * through, the same reason `AttendanceBanner` sits outside the cached page body
 * in `(site)/layout.tsx`.
 */
export async function NextMeeting() {
  const [first] = await upcoming();
  return <NextMeetingStrip meeting={first ?? null} now={new Date()} />;
}

/**
 * The meetings after the lead one, as the Events section's list. Empty is the
 * ordinary summer state, and the lead card already says so; this renders
 * nothing rather than a second empty message.
 */
export default async function UpcomingMeetings() {
  const [, ...rest] = await upcoming();
  if (rest.length === 0) return null;
  return (
    <div className="home-rows">
      {rest.map((meeting) => (
        <MeetingRow key={meeting.id} meeting={meeting} />
      ))}
    </div>
  );
}

/**
 * The soonest meetings that have not ended, up to `count`, soonest first.
 *
 * Catches its own failure and degrades to an empty list rather than throwing.
 * The homepage is the club's front door and has no error boundary of its own,
 * so a connection blip must cost the visitor a date, not the whole page. The
 * stack already renders empty properly, because an empty summer is the ordinary
 * case for months at a time.
 *
 * Bounded on `endsAt` like every other "upcoming" read here: a meeting already
 * in progress is still the one worth naming.
 */
export async function nextMeetings(count: number): Promise<MeetingInRange[]> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + 3);

  try {
    const meetings = await getMeetingsInRange(startOfDay(now), horizon);
    // Cancelled nights are skipped rather than shown struck through, and the
    // homepage has to say so itself: this reads `getMeetingsInRange`, which
    // deliberately keeps them because it feeds a SCHEDULE. This list answers a
    // different question, where should I go, and naming a cancelled meeting as
    // the next one is worse than the vanishing the column was added to fix.
    return meetings
      .filter((m) => m.endsAt >= now && m.cancelledAt === null)
      .slice(0, count);
  } catch {
    return [];
  }
}

/**
 * Midnight UTC on `at`'s day, so a meeting happening *right now* is inside the
 * window. Starting the range at the current instant would exclude the very
 * meeting this function exists to find, an hour into it.
 */
function startOfDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}
