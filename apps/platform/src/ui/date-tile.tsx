import type * as React from "react";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

type DateTileProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The event category; the fill is its 700. Omit for DevDogs red. */
  kind?: EventCategory;
  /** Weekday label, already formatted ("Mon"). */
  weekday: string;
  /** Day of the month, already formatted ("26"). */
  day: string | number;
  /** Month label, already formatted ("Oct"). */
  month: string;
};

/**
 * `.date` tile: weekday, day and month in the category's 700 with white text.
 * Takes plain values; it never builds a `Date`, so the caller decides the time
 * zone and the locale.
 */
function DateTile({
  kind,
  weekday,
  day,
  month,
  className,
  ...props
}: DateTileProps) {
  return (
    <div
      data-slot="date-tile"
      data-kind={kind}
      className={cn("date", className)}
      {...props}
    >
      <div className="dow">{weekday}</div>
      <div className="day">{day}</div>
      <div className="mon">{month}</div>
    </div>
  );
}

export { DateTile };
export type { DateTileProps };
