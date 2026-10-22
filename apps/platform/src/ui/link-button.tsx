import Link from "next/link";
import type { ComponentProps } from "react";

import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button";
import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  kind?: EventCategory;
};

/**
 * A `next/link` with button classes. Pass `variant` (and `size`, `kind`) for the
 * Cosmic button. Without a variant it keeps the old behaviour (only layout, the
 * caller's `className` supplies the look) so unmigrated callers render as before.
 */
export default function LinkButton({
  className,
  variant,
  size,
  kind,
  ...props
}: LinkButtonProps) {
  if (variant === undefined && size === undefined && kind === undefined) {
    return (
      <Link
        {...props}
        className={cn(
          "relative flex items-center justify-center gap-[1ch] transition-[translate,box-shadow,background-color,color] disabled:opacity-75 disabled:not-data-pending:cursor-not-allowed data-pending:cursor-progress",
          className,
        )}
      />
    );
  }
  const v = variant ?? "default";
  return (
    <Link
      data-slot="button"
      data-variant={v}
      data-size={size ?? "default"}
      data-kind={kind}
      {...props}
      className={buttonVariants({ variant: v, size, kind, className })}
    />
  );
}
