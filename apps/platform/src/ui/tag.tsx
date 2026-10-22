import type * as React from "react";

import { cn } from "~/lib/cn";

/** `.tag`: the luggage tag for tech names and handles. Not interactive. */
function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="tag" className={cn("tag", className)} {...props} />;
}

export { Tag };
