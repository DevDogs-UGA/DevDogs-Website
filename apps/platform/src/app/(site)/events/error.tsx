"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { reloadForChunkError } from "~/lib/chunkReload";
import EventsUnavailable from "~/components/EventsSection/EventsUnavailable";

/**
 * The events segment's boundary. The schedule is read in `page.tsx` now (it
 * used to live in a layout, which an error boundary cannot wrap), so a failed
 * read lands here as well as in `EventsBody`'s own catch.
 */
export default function EventsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A component whose code failed to download: loading the page again
    // usually fixes it, so that goes first (see ~/lib/chunkReload).
    if (reloadForChunkError(error)) return;
    // A Server Component's error reaches the client already stripped of its
    // message, so this logs the placeholder plus the digest rather than
    // anything sensitive. It is also the only record of the failure on the
    // visitor's side when they screenshot the console for us.
    //
    // captureException is safe unconditionally -- it no-ops with no DSN
    // configured, same contract as everywhere else in this app's Sentry
    // wiring.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return <EventsUnavailable digest={error.digest} retry={reset} />;
}
