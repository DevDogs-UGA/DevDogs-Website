"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { cn } from "~/lib/cn";
import "./overlays.css";
import { XIcon } from "@phosphor-icons/react/ssr";

type Side = "top" | "right" | "bottom" | "left";

/** Which edge the surrounding `SheetContent` slides from, so its header and footer can match. */
const SideContext = React.createContext<Side>("right");

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-[rgb(5_3_12_/_0.78)] duration-100",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `side="right"` (the default) is the kit's `.drawer`: 480px, a stepped left
 * edge, a header with the title, a scrolling `SheetBody` and a footer bar.
 * The other sides (the mobile nav, the docs outline) get a plain panel with
 * no drawer chrome.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  container,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: Side;
  showCloseButton?: boolean;
  /** Portal target; the kit gallery pins open states inside a stage. */
  container?: HTMLElement | null;
}) {
  const drawer = side === "right";
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10 fixed z-50 flex flex-col text-sm transition duration-200 ease-in-out outline-none",
          drawer
            ? "drawer inset-y-0 right-0 h-full min-h-0"
            : "sheet-panel gap-4 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=left]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        <SideContext.Provider value={side}>{children}</SideContext.Provider>
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              "iconbtn",
              drawer ? "drawer-close" : "absolute top-3 right-3",
            )}
          >
            <XIcon weight="bold" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/** In the drawer this is the kit's `header` (title block over a rule). */
function SheetHeader({ className, ...props }: React.ComponentProps<"header">) {
  const side = React.useContext(SideContext);
  return (
    <header
      data-slot="sheet-header"
      className={cn(side !== "right" && "flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

/** The drawer's scrolling middle (`.dbody`). */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("dbody", className)}
      {...props}
    />
  );
}

/** A drawer divider label (`.sect`): small caps with a trailing rule. */
function SheetSection({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-section"
      className={cn("sect", className)}
      {...props}
    />
  );
}

/** In the drawer this is the kit's action bar (`footer`). */
function SheetFooter({ className, ...props }: React.ComponentProps<"footer">) {
  const side = React.useContext(SideContext);
  return (
    <footer
      data-slot="sheet-footer"
      className={cn(
        side !== "right" && "mt-auto flex flex-col gap-2 p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  const side = React.useContext(SideContext);
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "[text-shadow:none]",
        side !== "right" && "text-base font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetSection,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
