import type * as React from "react";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

type ChipProps = React.ComponentProps<"span"> & {
  /** The event category that sets the colour; omit for DevDogs red. */
  kind?: EventCategory;
  /** A tinted ring instead of the solid fill (class `.hollow`: `.outline` clashes with Tailwind's utility). */
  outline?: boolean;
  /** A pixel-sparkle before the label. */
  dot?: boolean;
};

/**
 * `.chip` (kit-spec section 5): names an event category and always carries its
 * colour. The label is uppercased by CSS only, so assistive tech reads the
 * original case.
 */
function Chip({
  kind,
  outline,
  dot,
  className,
  children,
  style,
  ...props
}: ChipProps) {
  return (
    <span
      data-slot="chip"
      data-kind={kind}
      className={cn("chip", outline && "hollow", className)}
      style={style}
      {...props}
    >
      {dot ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export { Chip };
export type { ChipProps };
