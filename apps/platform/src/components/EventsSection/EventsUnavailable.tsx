import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
} from "@phosphor-icons/react/ssr";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import { EmptyState } from "~/ui/empty-state";

/**
 * What the events page says when it cannot read the schedule.
 *
 * Two callers that catch different failures share it: `error.tsx` catches
 * throws from the page and the routes below it, and `EventsBody` catches its
 * own read so the directions route degrades the same way.
 *
 * It degrades rather than apologises. The club's meetings are also listed on
 * the UGA Involvement Network, a different host on a different database, so it
 * is still up when ours is not. That link is the point: somebody who came for
 * the date should leave with the date. Retrying is the second-best outcome.
 */
export default function EventsUnavailable({
  digest,
  retry,
}: {
  /** The server error's digest, when there is one. A hash, never the message. */
  digest?: string;
  /**
   * Present only when a React error boundary is what caught this, since only a
   * client component can hand over a callback. The page's own `try`/`catch` has
   * nothing equivalent, so it gets the reload link below instead.
   */
  retry?: () => void;
}) {
  return (
    <div className="wrap ev-fill ev-wrap ev-unavailable">
      <EmptyState
        headingLevel={2}
        title="The schedule could not be loaded"
        description="This page reads meetings from the club database, and that read failed. Nothing has changed about the meetings themselves. Try again in a moment, or read the same schedule on the UGA Involvement Network."
      >
        {retry ? (
          // `retry()` re-fetches and re-renders the boundary's children. The
          // Next 16 docs single it out over `reset()`, which only clears the
          // error state without re-running the read.
          <button type="button" className="btn primary" onClick={() => retry()}>
            <ArrowClockwiseIcon weight="bold" aria-hidden /> Try again
          </button>
        ) : (
          /* eslint-disable-next-line @next/next/no-html-link-for-pages --
             A full reload IS the point: the router would re-use the same
             failed render and the button would do nothing visible. */
          <a href="/events" className="btn primary">
            <ArrowClockwiseIcon weight="bold" aria-hidden /> Reload the page
          </a>
        )}
        <a
          href={INVOLVEMENT_NETWORK_EVENTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn secondary"
        >
          Events on the Involvement Network{" "}
          <ArrowUpRightIcon weight="bold" aria-hidden />
        </a>
      </EmptyState>
      {/* The digest is a hash, not the error: it carries nothing about what
          went wrong, and it is the only handle matching this failure to a line
          in the server logs. */}
      {digest && (
        <p className="small muted ev-digest mono">
          Reference {digest}. Quote this if you email us about it.
        </p>
      )}
    </div>
  );
}
