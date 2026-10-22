import type * as React from "react";

import { cn } from "~/lib/cn";

/** A keyboard key cap: mono 11.5 with a stepped 1px ring (kit-spec section 5). */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" className={cn("kbd", className)} {...props} />;
}

export { Kbd };
