"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { reloadForChunkError } from "~/lib/chunkReload";

/**
 * The last boundary: the root layout itself failed, so `(site)/error.tsx`
 * never mounted.
 *
 * Every style here is inline and every colour is a literal. `global-error`
 * replaces the root layout when it renders, so it renders its own document and
 * receives **none** of the app's stylesheet: no Tailwind utilities, no Cosmic
 * kit, no fonts, no images. A className here would silently do nothing, so the
 * Cosmic ground is spelled out by hand: `#0a0718` (the sky), `#fff` (ink),
 * `#a89ea9` (muted text) and `#ffa1ad` (the accent).
 */
export default function GlobalError({
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
    // The root layout itself failed, which is the one boundary Sentry's own
    // Next.js docs single out: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#error-handling
    // The rest of the app's Server Components/Actions/routes are captured
    // server-side in cloudflare/worker.ts; this is the client-side layer's
    // last resort, and captureException here is safe to call unconditionally
    // -- it no-ops with no DSN configured, the same as everywhere else.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    // global-error must include html and body tags
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "#0a0718",
          color: "#ffffff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>Something went wrong — DevDogs</title>
        <main style={{ maxWidth: "34rem", display: "grid", gap: "1rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#ffa1ad",
            }}
          >
            Error
          </p>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 800 }}>
            DevDogs is having a moment
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#a89ea9",
            }}
          >
            The page could not be built at all, which is a level above a failed
            read. Trying again is worth one attempt; if it keeps happening, let
            an officer know and quote the reference below.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              paddingTop: "0.25rem",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                border: "2px solid #ffffff",
                borderRadius: "0.25rem",
                background: "#ffffff",
                color: "#000000",
                font: "inherit",
                fontSize: "0.875rem",
                fontWeight: 500,
                padding: "0.4rem 1rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A real navigation, not a <Link>. The root layout is the thing
                that just failed, so a client-side transition would re-enter
                the same broken tree; only a document load rebuilds it. The
                lint rule assumes a working shell, which is exactly what this
                file exists to handle the absence of. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#ffa1ad", fontSize: "0.875rem" }}>
              Back to the homepage
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                margin: 0,
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#a89ea9",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
