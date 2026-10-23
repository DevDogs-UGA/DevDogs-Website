"use client";

import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react/ssr";

import { Button } from "~/ui/button";
import LinkButton from "~/ui/link-button";

import "./content.css";

/**
 * The look of every in-layout error boundary (`404.html`'s empty state with the
 * error's words). The boundary file owns Sentry, the chunk reload and `reset`;
 * this only draws. The digest is the one handle on what happened, since a
 * Server Component's message never reaches the client.
 */
export default function ErrorPanel({
  title,
  children,
  digest,
  reset,
}: {
  title: string;
  children: React.ReactNode;
  digest?: string;
  reset: () => void;
}) {
  return (
    <section className="content-nf" role="alert">
      <div className="wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cosmic/a/mascot-peek.png" alt="" />
        <div className="eyebrow k">Error</div>
        <h1 className="display">{title}</h1>
        <p>{children}</p>
        <div className="content-nf-actions">
          <span className="btn-shadow">
            <Button variant="default" onClick={() => reset()}>
              <ArrowClockwiseIcon weight="bold" aria-hidden /> Try again
            </Button>
          </span>
          <LinkButton href="/" variant="secondary">
            <HouseIcon weight="bold" aria-hidden /> Back to the homepage
          </LinkButton>
        </div>
        {digest && <p className="content-nf-ref">Reference {digest}</p>}
      </div>
    </section>
  );
}
