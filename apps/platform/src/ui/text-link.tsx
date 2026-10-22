import * as React from "react";
import { Slot } from "./slot";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

type TextLinkProps = React.ComponentProps<"a"> & {
  /** Render the child (a `next/link`, say) with the text-link look. */
  asChild?: boolean;
  /** Tints the link with the event category's hue. */
  kind?: EventCategory;
};

/** `.textlink`: bold, the context hue, underlined on hover. Put a trailing `ArrowRightIcon weight="bold"` inside for the arrow. */
function TextLink({ className, asChild, kind, ...props }: TextLinkProps) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-slot="text-link"
      data-kind={kind}
      className={cn("textlink", className)}
      {...props}
    />
  );
}

export { TextLink };
export type { TextLinkProps };
