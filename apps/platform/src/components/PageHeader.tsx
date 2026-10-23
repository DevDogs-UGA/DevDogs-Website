import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import Scene from "~/components/Scene";
import { cn } from "~/lib/cn";
import type { EventCategory } from "~/lib/eventKind";

/** The legacy hue names pages still pass; declared here. */
export type AccentColor =
  "amber" | "blue" | "cyan" | "emerald" | "rose" | "violet";

export type PageHeadKind = "brand" | EventCategory;

/** rose is the brand's red; the rest map onto the nearest event category. */
const ACCENT_HEAD: Record<AccentColor, PageHeadKind> = {
  rose: "brand",
  amber: "info",
  cyan: "build",
  emerald: "workshop",
  violet: "milestone",
  blue: "build",
};

interface Props extends PropsWithChildren {
  title: string;
  description?: ReactNode;
  /** Legacy hue; mapped onto `head` when neither `head` nor `kind` is given. */
  accent?: AccentColor;
  /** An event category: sets the head's hue and the strip's `data-kind`. */
  kind?: EventCategory;
  /** Which head art to use. Defaults to `kind`, then the mapped `accent`, then the brand. */
  head?: PageHeadKind;
  /** Breadcrumbs, rendered above the title. */
  crumbs?: ReactNode;
  /** Vertically center actions against the complete title/description block. */
  centerActions?: boolean;
  /** Page-specific layout for the action group. */
  actionsClassName?: string;
}

/**
 * The page's title, and the only `h1` on it: the `.pagehead` strip over its
 * generated scene. A server component; the animated `<Scene>` is the only
 * client piece inside it.
 *
 * Nothing above this in the tree supplies one: TopNav is chrome and the site
 * layout contributes a landmark rather than a heading. The card headers
 * beneath it are the `h2`s; see `ConsoleCard.Header`.
 */
export default function PageHeader({
  title,
  description,
  accent,
  kind,
  head,
  crumbs,
  children,
  centerActions = false,
  actionsClassName = "",
}: Props) {
  const art: PageHeadKind =
    head ?? kind ?? (accent ? ACCENT_HEAD[accent] : "brand");
  return (
    <section
      className="pagehead"
      data-kind={kind ?? (art === "brand" ? undefined : art)}
      style={{ "--head": `url(/cosmic/img/head-${art}.png)` } as CSSProperties}
    >
      <Scene name={`head-${art}`} />
      <div className="wrap">
        {crumbs}
        <div
          className={cn(
            "flex flex-wrap items-end justify-between gap-4",
            centerActions && "items-center",
          )}
        >
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="display">{title}</h1>
            {description && (
              <p className="lead m-0 max-w-prose">{description}</p>
            )}
          </div>
          {children && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2",
                actionsClassName,
              )}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
