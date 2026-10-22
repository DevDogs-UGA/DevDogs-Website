import type { ComponentPropsWithoutRef, ElementType } from "react";

import { cn } from "~/lib/cn";

type BandProps = ComponentPropsWithoutRef<"div"> & { as?: ElementType };

/**
 * `.band`: a darker section entered and left through a dithered 24px edge.
 *
 * The edges overhang 24px outside the box, so the parent must not clip
 * (`overflow: hidden`). Alternate bands with plain sections: never two in a row.
 */
export function Band({ as: As = "section", className, ...props }: BandProps) {
  return <As data-slot="band" className={cn("band", className)} {...props} />;
}

export default Band;
