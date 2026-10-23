import type { ReactNode } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import LinkButton from "~/ui/link-button";
import { EVENTS_BLURB } from "~/components/homeCopy";

interface Props {
  /**
   * The list of upcoming nights, pre-rendered by the caller.
   *
   * Passed in rather than fetched here: this component renders inside
   * `HomeSections`'s `"use cache"` scope (see `page.tsx`), and the list needs
   * today's schedule, not whatever was on it when the cache entry was last
   * populated. `page.tsx` builds this element from `UpcomingMeetings` before
   * entering the cached tree, so its database read stays on the request that's
   * actually being served. See `UpcomingMeetings`'s doc comment.
   */
  upcomingMeetings: ReactNode;
}

/**
 * The homepage's events section: a heading, the meetings after the lead card,
 * and the way through to the rest.
 *
 * Deliberately smaller than `/events`. `/events` answers *when*: every meeting
 * past and coming, and the calendar. The homepage answers *what happens if I
 * turn up*: a few concrete dates. The explainer ("Weekly Programming") is the
 * band under this section.
 */
export default function EventsSection({ upcomingMeetings }: Props) {
  return (
    <section id="events" className="section scroll-mt-20">
      <div className="wrap">
        <div className="home-shead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Events
            </div>
            <h2>Merge Monday, and more.</h2>
            <p
              className="muted"
              style={{ margin: "12px 0 0", maxWidth: "60ch" }}
            >
              {EVENTS_BLURB}
            </p>
          </div>
          <LinkButton href="/events" variant="secondary">
            All events <ArrowRightIcon weight="bold" />
          </LinkButton>
        </div>
        {upcomingMeetings}
      </div>
    </section>
  );
}
