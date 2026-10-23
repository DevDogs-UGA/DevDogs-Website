import Image from "next/image";
import { cn } from "~/lib/cn";
import type { ComponentType } from "react";
import devdog from "~/assets/devdog.svg";
import * as icons from "~/config/icons";
import { docsProjectMark } from "~/config/docs";
import type { EventCategory } from "~/lib/eventKind";
import "~/components/Docs/docs.css";

type MarkSize = "sm" | "lg";

/** `.pm` hue per documented project; unlisted projects wear the club red. */
const PROJECT_KIND: Record<string, EventCategory | undefined> = {
  toolkit: "build",
  workshops: "workshop",
};

/** The category hue a project's docs wear (tiles, headings, active rows). */
export function docsProjectKind(slug: string): EventCategory | undefined {
  return PROJECT_KIND[slug];
}

/** Projects with an app mark of their own (DogDays), drawn bare in the tile. */
const PROJECT_IMAGE: Record<string, string> = {
  "schedule-builder": "/cosmic/a/dogdays.png",
};

interface MarkProps {
  icon: ComponentType<{ className?: string; weight?: "bold" | "fill" }>;
  /** The event category hue behind the glyph; omit for the club red. */
  kind?: EventCategory;
  size?: MarkSize;
  /** Legacy fill class (TopNav's sub-menu rows); the tile paints from `kind` now. */
  iconBg?: string;
}

/** `.pm` (docs kit): a stepped tile in the hue, white glyph. */
export function Mark({ icon: Icon, kind, size = "sm", iconBg }: MarkProps) {
  return (
    <span
      aria-hidden
      data-kind={kind}
      className={cn(size === "lg" ? "docs-pm lg" : "docs-pm", iconBg)}
    >
      <Icon weight="bold" />
    </span>
  );
}

/**
 * A documented project's mark: the mascot for the platform, DogDays' own mark
 * for the schedule builder, else a glyph on a tile (see DOCS_PROJECT_MARKS).
 */
export default function DocsProjectMark({
  slug,
  size,
}: {
  /** The docs slug, i.e. the project's workspace directory name. */
  slug: string;
  size?: MarkSize;
}) {
  const { kind, icon } = docsProjectMark(slug);
  const image = PROJECT_IMAGE[slug];
  const tileKind = PROJECT_KIND[slug];

  if (kind === "logo" || image) {
    return (
      <span
        aria-hidden
        data-kind={tileKind}
        className={size === "lg" ? "docs-pm lg" : "docs-pm"}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 40px static mark
          <img src={image} alt="" />
        ) : (
          <Image alt="" src={devdog} sizes="32px" />
        )}
      </span>
    );
  }
  return <Mark icon={icons[icon]} kind={tileKind} size={size} />;
}
