"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

type AvatarSize = "sm" | "default" | "md" | "lg";

/** Outer box per size (kit `.avatar`: 28 / 36 / 56 / 96). */
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "size-7",
  default: "size-9",
  md: "size-14",
  lg: "size-24",
};

type AvatarProps = React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: AvatarSize;
  /** Tints the fallback fill with the event category's colour. */
  kind?: EventCategory;
};

/**
 * `.avatar` (kit-spec section 5). The pixel-rounded clip-path cuts the Radix
 * root, so the wrapper is the sized, positioned box and any `AvatarBadge`
 * child is lifted out of the clipped root and drawn on the wrapper.
 */
function Avatar({
  className,
  size = "default",
  kind,
  children,
  ...props
}: AvatarProps) {
  const all = React.Children.toArray(children);
  const badges = all.filter(
    (c) => React.isValidElement(c) && c.type === AvatarBadge,
  );
  const rest = all.filter((c) => !badges.includes(c));
  return (
    <span
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative inline-flex shrink-0 select-none",
        SIZE_CLASS[size],
        className,
      )}
    >
      <AvatarPrimitive.Root
        data-slot="avatar-root"
        data-kind={kind}
        className={cn(
          "avatar",
          size === "sm" && "sm",
          size === "md" && "md",
          size === "lg" && "lg",
          "size-full!",
        )}
        {...props}
      >
        {rest}
      </AvatarPrimitive.Root>
      {badges}
    </span>
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center", className)}
      {...props}
    />
  );
}

/**
 * The status dot (the nav's warning dot). Lives on the wrapper, outside the clip,
 * and is lifted only when it is a direct child of `Avatar` (not inside a fragment).
 * It is colour-only: pair it with visually hidden text or an aria-label on the trigger.
 */
function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center bg-[var(--warn)] ring-2 ring-[var(--bg)] select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=md]/avatar:size-3 group-data-[size=md]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-4 group-data-[size=lg]/avatar:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/** `.avatars`: an overlapping row, 8px of overlap. */
function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn("group/avatar-group flex [&>*+*]:-ml-2", className)}
      {...props}
    />
  );
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "avatar relative group-has-data-[size=lg]/avatar-group:size-24 group-has-data-[size=md]/avatar-group:size-14 group-has-data-[size=sm]/avatar-group:size-7 [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
};
export type { AvatarProps, AvatarSize };
