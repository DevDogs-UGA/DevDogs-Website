"use client";

import * as React from "react";
import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "~/lib/cn";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 data-horizontal:h-0.5 data-horizontal:w-full data-horizontal:bg-[repeating-linear-gradient(90deg,var(--line-strong)_0_6px,transparent_6px_12px)] data-vertical:w-0.5 data-vertical:self-stretch data-vertical:bg-[repeating-linear-gradient(180deg,var(--line-strong)_0_6px,transparent_6px_12px)]",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
