"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import ErrorPanel from "~/components/Content/ErrorPanel";
import { reloadForChunkError } from "~/lib/chunkReload";

/**
 * The boundary for every page in the site layout that does not bring its own:
 * the console and the account and tools pages.
 * The events segment has its own; see `events/error.tsx`.
 *
 * Until this existed, a loader that threw put Next's unstyled default error
 * screen in front of an officer, which reads as the site being gone rather
 * than one read having failed. Loaders throw when a database goes away
 * mid-request or a Supabase token fails to refresh.
 *
 * The digest is the only handle on what happened: a Server Component's error
 * reaches the client stripped of its message, and the digest ties the
 * screenshot somebody sends us to the line in the server log.
 */
export default function SiteError({
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
    // captureException is safe unconditionally -- it no-ops with no DSN
    // configured, same contract as everywhere else in this app's Sentry
    // wiring.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <ErrorPanel title="That did not load" digest={error.digest} reset={reset}>
      Something this page needed failed to come back. Nothing you did caused it
      and nothing was saved incorrectly. Trying again is usually enough,
      because the failure is almost always one read rather than the service.
    </ErrorPanel>
  );
}
