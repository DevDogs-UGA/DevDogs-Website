import * as React from "react";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";
import { Slot } from "./slot";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

/**
 * Cosmic buttons (`.btn` in cosmic.css, kit-spec section 4). The face, the
 * reveal shadow and the focus ring are all the kit's; this file only picks the
 * classes, so `buttonVariants()` stays a plain class-string function that links
 * and dialog actions can call without rendering a `Button`.
 */
type ButtonVariant =
  | "default" // .btn.primary
  | "outline" // .btn.secondary
  | "secondary" // .btn.secondary (same look, kept for callers)
  | "ghost"
  | "destructive" // .btn.danger (outline)
  | "link" // .textlink: text only, no frame or height
  | "flat" // .btn.secondary.flat: no lift, no reveal shadow
  | "danger-solid" // .btn.danger.solid: the destructive action itself
  | "terminal";

type ButtonSize =
  "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "btn primary",
  outline: "btn secondary",
  secondary: "btn secondary",
  ghost: "btn ghost",
  destructive: "btn danger",
  link: "textlink",
  flat: "btn secondary flat",
  "danger-solid": "btn danger solid",
  terminal: "btn terminal",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: "",
  xs: "sm",
  sm: "sm",
  lg: "lg",
  icon: "icon",
  "icon-xs": "icon sm",
  "icon-sm": "icon sm",
  "icon-lg": "icon lg",
};

/** Variants whose face takes the event category's hue when `kind` is set. */
const KIND_VARIANTS: ReadonlySet<ButtonVariant> = new Set([
  "default",
  "outline",
  "secondary",
  "flat",
]);

const ICON_CLASS =
  "[&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0";

interface ButtonVariantOptions {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  kind?: EventCategory | null;
  className?: string;
}

function buttonVariants({
  variant,
  size,
  kind,
  className,
}: ButtonVariantOptions = {}): string {
  const v = variant ?? "default";
  const isLink = v === "link";
  return cn(
    VARIANT_CLASS[v],
    !isLink && SIZE_CLASS[size ?? "default"],
    kind && KIND_VARIANTS.has(v) && "k",
    !isLink && ICON_CLASS,
    className,
  );
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  /** Sets `data-kind` and tints primary and secondary faces with the category. */
  kind?: EventCategory;
  /**
   * Shows a spinner over the label, keeps the button's width, sets `aria-busy`
   * and disables it. With `asChild` only the attributes apply.
   */
  loading?: boolean;
};

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  kind,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const classes = cn(
    buttonVariants({ variant, size, kind }),
    loading && "data-loading:cursor-progress data-loading:opacity-100",
    className,
  );

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-kind={kind}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={classes}
      {...(asChild ? {} : { disabled: Boolean(disabled) || loading })}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <span className="invisible contents">{children}</span>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <SpinnerGapIcon
              weight="bold"
              className="animate-spin [animation-duration:750ms] motion-reduce:animate-none"
            />
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps, ButtonSize, ButtonVariant };
