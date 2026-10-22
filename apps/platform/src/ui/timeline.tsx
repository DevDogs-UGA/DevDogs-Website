import type * as React from "react";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

/** `.timeline`: a dashed rule with a square marker per entry (the changelog, an event agenda). */
function Timeline({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline"
      role="list"
      className={cn("timeline", className)}
      {...props}
    />
  );
}

/** One entry. `kind` tints its marker; omit for DevDogs red. */
function TimelineItem({
  kind,
  children,
  ...props
}: React.ComponentProps<"div"> & { kind?: EventCategory }) {
  return (
    <div data-slot="timeline-item" role="listitem" data-kind={kind} {...props}>
      <span className="pt" aria-hidden />
      {children}
    </div>
  );
}

export { Timeline, TimelineItem };
