import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { EmptyState } from "~/ui/empty-state";
import { buttonVariants } from "~/ui/button";

/**
 * An unknown slug. The wording claims only what is known, that the link
 * resolved to no live meeting, which covers both a typo and an officer
 * archiving a night after the link was shared.
 */
export default function MeetingNotFound() {
  return (
    <div className="wrap" style={{ padding: "var(--space-9) 0" }}>
      <h1 className="sr-only">Meeting not found</h1>
      <EmptyState
        headingLevel={2}
        title="No meeting lives at this link"
        description="It may have left the schedule, or the address has a typo."
      >
        <Link
          href="/events"
          className={buttonVariants({ variant: "secondary" })}
        >
          <ArrowLeftIcon weight="bold" aria-hidden /> Back to the schedule
        </Link>
      </EmptyState>
    </div>
  );
}
