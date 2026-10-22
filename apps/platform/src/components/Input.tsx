"use client";

import "~/ui/fields.css";
import {
  useCallback,
  type FocusEvent,
  type InputHTMLAttributes,
  type PropsWithChildren,
} from "react";
import { LockIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";
import { CopyButton } from "~/ui/copy-field";

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  /** Goes on the `.input` frame, like `ui/input`. */
  className?: string;
  mono?: boolean;
  /** Read-only value with a trailing copy button that flips to a check. */
  copy?: boolean;
}

/**
 * The kit's `.input` frame with the extras the settings pages use: `mono` for
 * identifiers, `copy` for a read-only value with a copy button, and a lock when
 * disabled. Native props land on the inner `<input>`; `aria-invalid` draws the
 * frame in the invalid colour.
 */
function InputBase({
  mono,
  copy,
  className,
  value,
  disabled,
  readOnly,
  onFocus,
  ...props
}: InputProps) {
  const handleFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.setSelectionRange(0, -1, "none");
  }, []);

  return (
    <span
      className={cn(
        "input has-disabled:cursor-not-allowed has-disabled:opacity-60 has-[[aria-invalid=true]]:[--bo:var(--bad)]",
        mono && "mono",
        copy && !disabled && "pr-1",
        className,
      )}
    >
      {disabled && (
        <LockIcon aria-hidden className="shrink-0 text-[var(--text-3)]" />
      )}
      <input
        value={value}
        disabled={disabled}
        readOnly={copy ? true : readOnly}
        onFocus={copy ? handleFocus : onFocus}
        {...props}
      />
      {copy && !disabled && typeof value === "string" && (
        <CopyButton value={value} />
      )}
    </span>
  );
}

function MonoText({ children }: PropsWithChildren) {
  return <code className="cursor-default">{children}</code>;
}

export default Object.assign(InputBase, { Text: MonoText });
