import type { PropsWithChildren, ReactNode } from "react";

import PageHeader, {
  type AccentColor,
  type PageHeadKind,
} from "~/components/PageHeader";
import type { EventCategory } from "~/lib/eventKind";

interface PageShellProps extends PropsWithChildren {
  /** Legacy hue; maps to a head (rose is the brand, the others an event category). */
  accent?: AccentColor;
  title: string;
  description?: ReactNode;
  /** An event category for the head's hue. */
  kind?: EventCategory;
  head?: PageHeadKind;
  crumbs?: ReactNode;
  /**
   * Rendered opposite the title, in the header's own row. A page-level control
   * belongs here rather than above the first card, where it has to be dragged
   * back over the header's margin to look attached to anything.
   */
  actions?: ReactNode;
}

/**
 * The opening of every page inside the site layout: the full-width page head
 * (title over its scene), then a centred column for the content.
 *
 * Was `ConsolePageShell`, which was never accurate. The console is six of its
 * callers and one of the rest is the public results page.
 */
export default function PageShell({
  accent,
  title,
  description,
  kind,
  head,
  crumbs,
  actions,
  children,
}: PageShellProps) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        accent={accent}
        kind={kind}
        head={head}
        crumbs={crumbs}
      >
        {actions}
      </PageHeader>
      <div className="wrap flex w-full flex-col gap-6 py-8">{children}</div>
    </>
  );
}
