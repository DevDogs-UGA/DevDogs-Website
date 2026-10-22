"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

type CopyState = "pristine" | "pending" | "success" | "failure";

/**
 * The trailing `.iconbtn` of a copy field. It flips to a check (`--ok`) or a
 * cross (`--bad`) for two seconds, announced through a polite live region, and
 * is disabled while it shows the result.
 */
function CopyButton({
  value,
  disabled,
  className,
  label = "Copy",
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("pristine");

  const copy = useCallback(() => {
    setState("pending");
    navigator.clipboard
      .writeText(value)
      .then(() => setState("success"))
      .catch((e) => {
        console.error(e);
        setState("failure");
      });
  }, [value]);

  useEffect(() => {
    if (state !== "success" && state !== "failure") return;
    const timeout = setTimeout(() => setState("pristine"), 2000);
    return () => clearTimeout(timeout);
  }, [state]);

  return (
    <>
      <button
        type="button"
        className={cn("iconbtn shrink-0", className)}
        onClick={copy}
        disabled={state !== "pristine" || disabled}
        data-state={state}
        title={label}
        aria-label={label}
      >
        {state === "pristine" && <CopyIcon aria-hidden />}
        {state === "pending" && (
          <SpinnerGapIcon aria-hidden className="animate-spin" />
        )}
        {state === "success" && (
          <CheckIcon aria-hidden weight="bold" className="text-[var(--ok)]" />
        )}
        {state === "failure" && (
          <XIcon aria-hidden weight="bold" className="text-[var(--bad)]" />
        )}
      </button>
      <span role="status" className="sr-only">
        {state === "success"
          ? "Copied"
          : state === "failure"
            ? "Copy failed"
            : ""}
      </span>
    </>
  );
}

/**
 * A read-only value in a `.input` frame with a copy button on the right
 * (client IDs, issuer URLs). Focusing the field selects its text.
 */
function CopyField({
  value,
  mono = true,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  mono?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span className={cn("input pr-1", mono && "mono", className)}>
      <input
        readOnly
        value={value}
        aria-label={ariaLabel}
        onFocus={(e) => e.currentTarget.select()}
      />
      <CopyButton value={value} />
    </span>
  );
}

export { CopyButton, CopyField };
