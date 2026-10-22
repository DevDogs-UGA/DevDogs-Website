import type { ComponentPropsWithoutRef, ElementType } from "react";

import { cn } from "~/lib/cn";

type BoxProps = ComponentPropsWithoutRef<"div"> & { as?: ElementType };

/** `.box`: a plain stepped container with no frame or block shadow. */
export function Box({ as: As = "div", className, ...props }: BoxProps) {
  return <As data-slot="box" className={cn("box", className)} {...props} />;
}

export default Box;
