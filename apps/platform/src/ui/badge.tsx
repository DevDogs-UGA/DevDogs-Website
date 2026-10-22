import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

/** `.badge` states (kit-spec section 5): the default is neutral, the rest carry a state colour. */
const VARIANT_CLASSES = {
  default: "",
  success: "ok",
  warning: "warn",
  danger: "bad",
  info: "note",
  brand: "brand",
} as const;

interface BadgeProps {
  variant?: keyof typeof VARIANT_CLASSES;
  className?: string;
  children: ReactNode;
}

/** A state label. Not interactive; use a button for that. */
export default function Badge({
  variant = "default",
  className,
  children,
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn("badge", VARIANT_CLASSES[variant], className)}
    >
      {children}
    </span>
  );
}
