"use client";

import "./command.css";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "~/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";
import { Kbd } from "~/ui/kbd";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";

/**
 * The command palette (search.html): a Dialog card holding a query field,
 * grouped result rows with an icon tile, and key hints. cmdk owns the
 * selection and keyboard model; this file only draws it.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("cmd", className)}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          "cmd-dialog top-[72px] w-[min(680px,calc(100vw-2rem))] translate-y-0 gap-0 overflow-visible sm:max-w-[680px]",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  // Kept so existing callers compile; the palette's field has one size now.
  fieldClassName,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  fieldClassName?: string;
}) {
  return (
    <div
      data-slot="command-input-wrapper"
      className={cn("cmd-in", fieldClassName)}
    >
      <MagnifyingGlassIcon weight="bold" aria-hidden />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={className}
        {...props}
      />
      <Kbd aria-hidden>Esc</Kbd>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("cmd-list", className)}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("cmd-empty", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  count,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group> & {
  /** The number of rows, drawn small beside the caption. */
  count?: number;
}) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={className}
      heading={
        heading !== undefined && count !== undefined ? (
          <>
            {heading}
            <span className="cmd-count">{count}</span>
          </>
        ) : (
          heading
        )
      }
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("cmd-sep", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  icon,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
  /** An icon for the row's 34px tile; it takes the category colour. */
  icon?: React.ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn("cmd-item", className)}
      {...props}
    >
      {icon ? (
        <span className="cmd-ic" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </CommandPrimitive.Item>
  );
}

/** The right-hand key hint of a row (`G A`); `Open` shows only on the selected row. */
function CommandShortcut({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("cmd-end", className)}
      {...props}
    >
      {children}
    </span>
  );
}

/** Key hints under the list (arrows, enter, escape). Hidden on phones. */
function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn("cmd-foot", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  CommandFooter,
};
