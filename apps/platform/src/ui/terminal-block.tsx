import type * as React from "react";
import { TerminalWindowIcon } from "@phosphor-icons/react/ssr";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

/**
 * The terminal voice (`.termbar` + `pre.term`): `$` and the command in the
 * context's hue, comments dim, a block cursor. The one kit surface that keeps a
 * 1px inset outline. Compose the text with the `Term*` spans.
 */
function TerminalBlock({
  title = "bash",
  kind,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  /** The bar's label; `false` for a bare block. */
  title?: string | false;
  kind?: EventCategory;
}) {
  return (
    <div
      data-slot="terminal-block"
      data-kind={kind}
      className={className}
      {...props}
    >
      {title !== false && (
        <div className="termbar">
          <TerminalWindowIcon weight="bold" aria-hidden />
          {title}
        </div>
      )}
      <pre className="term" tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}

const span = (cls: string) =>
  function TermSpan({ className, ...props }: React.ComponentProps<"span">) {
    return <span className={cn(cls, className)} {...props} />;
  };

/** `$` and command words. */
const TermPrompt = span("p");
/** A dim comment line. */
const TermComment = span("c");
/** A success or string value. */
const TermString = span("s");
/** A highlighted name (handle, flag). */
const TermKeyword = span("k");

/** The block cursor. */
function TermCursor({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("cur", className)} aria-hidden {...props} />;
}

export {
  TerminalBlock,
  TermPrompt,
  TermComment,
  TermString,
  TermKeyword,
  TermCursor,
};
