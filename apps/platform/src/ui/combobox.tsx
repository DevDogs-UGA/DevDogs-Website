"use client";

import * as Popover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "~/lib/cn";

/**
 * The open list's frame (`.lb`, the kit's list box) and its row look, shared by
 * every field that opens a list: `Select`, the pronoun combobox, the settings
 * search. Rows tint whole on hover / keyboard highlight (no side stripe), the
 * chosen row keeps a brand tint, and rows grow to 44px on coarse pointers.
 */
export const LB_FRAME =
  "lb p-1.5 [--fill:var(--raised)] text-[14.5px] text-[var(--text-2)]";
export const LB_ITEM =
  "relative flex min-h-9 cursor-default items-center gap-2.5 px-3 py-2 text-[var(--text-2)] outline-none select-none data-[highlighted]:bg-[color-mix(in_srgb,var(--raised)_86%,#fff)] data-[highlighted]:text-[var(--text)] data-[highlighted]:[clip-path:var(--step1)] data-[state=checked]:bg-[color-mix(in_srgb,var(--k3)_26%,var(--raised))] data-[state=checked]:text-[var(--text)] data-[state=checked]:[clip-path:var(--step1)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [@media(pointer:coarse)]:min-h-11";

// ── ComboboxPanel ─────────────────────────────────────────────────────────────
// Standalone animated container for non-Radix combobox popovers (SettingsSearch).
// Caller controls mounting; `open` drives data-state for the CSS animation.

interface ComboboxPanelProps {
  open: boolean;
  className?: string;
  children: ReactNode;
}

export function ComboboxPanel({
  open,
  className,
  children,
}: ComboboxPanelProps) {
  return (
    <div
      data-state={open ? "open" : "closed"}
      className={cn(
        "md:combobox-panel lb p-1.5 [--fill:var(--raised)] md:shadow-none!",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── ComboboxPopover ───────────────────────────────────────────────────────────
// Compound object for Radix-based combobox popovers (PronounsField).
// Content wraps Popover.Content, adding combobox-popover so the CSS animation fires.
// Radix Presence reads animationend and delays unmounting for the exit animation.

function Content({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Popover.Content>) {
  return (
    <Popover.Content
      className={cn(
        "combobox-popover",
        LB_FRAME,
        "flex flex-col",
        // Older callers still pass the mauve border / fill / block shadow; the
        // frame is the list box's now, so those lose.
        "rounded-none! border-0! bg-transparent! shadow-none!",
        className,
      )}
      {...props}
    >
      {/* The frame's ::before/::after paint at inset 0 of this element, so the
          scroller must be a child or the ring scrolls away with the rows. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Popover.Content>
  );
}

export const ComboboxPopover = {
  Root: Popover.Root,
  Anchor: Popover.Anchor,
  Portal: Popover.Portal,
  Content,
};
