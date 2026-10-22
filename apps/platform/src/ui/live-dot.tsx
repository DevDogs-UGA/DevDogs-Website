import type * as React from "react";

import { cn } from "~/lib/cn";

/** `.live`: an 8px green square with a halo, then a label ("Live now"). */
function LiveDot({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span data-slot="live-dot" className={cn("live", className)} {...props}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export { LiveDot };
