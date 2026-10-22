"use client";

import "./collapsible.css";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

const DisclosureContext = React.createContext(false);

/**
 * Radix Collapsible. Bare by default (the docs sidebar and the TOC style their
 * own triggers); `disclosure` dresses it as the docs `.dt` card with a caret
 * that turns when open.
 */
function Collapsible({
  disclosure = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root> & {
  disclosure?: boolean;
}) {
  return (
    <DisclosureContext.Provider value={disclosure}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        className={cn(disclosure && "dt", className)}
        {...props}
      />
    </DisclosureContext.Provider>
  );
}

function CollapsibleTrigger({
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  const disclosure = React.useContext(DisclosureContext);
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    >
      {disclosure && (
        <CaretRightIcon weight="bold" className="dt-caret" aria-hidden />
      )}
      {children}
    </CollapsiblePrimitive.CollapsibleTrigger>
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
