"use client";

import type { PropsWithChildren } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/ssr";

interface FieldProps extends PropsWithChildren {
  label: string;
  description?: string;
  htmlFor?: string;
  id?: string;
  /** Shown under the control with an icon and `role="alert"`; never colour alone. */
  error?: string | null;
  /** Adds a visible "Required" next to the label. */
  required?: boolean;
  /** Right-aligned under the control: "112 / 240". */
  count?: string;
}

/**
 * The kit's `.field`: label, control, help text, error. With `htmlFor` the whole
 * block is the `<label>` (clicking the text focuses the control); without it the
 * block is a `<div>` and the control brings its own label.
 */
export default function Field({
  label,
  description,
  htmlFor,
  id,
  error,
  required,
  count,
  children,
}: FieldProps) {
  const header = (
    <>
      <span className="label">
        {label}
        {required && (
          <span className="ml-2 text-[12.5px] font-normal text-[var(--text-3)]">
            Required
          </span>
        )}
      </span>
      {description && <span className="help max-w-prose">{description}</span>}
    </>
  );
  const footer = (
    <>
      {error && (
        <span className="err" role="alert">
          <WarningCircleIcon weight="fill" aria-hidden className="shrink-0" />
          {error}
        </span>
      )}
      {count && <span className="count">{count}</span>}
    </>
  );

  // scroll-mt clears the sticky TopNav when search jumps to #id.
  const className = "field scroll-mt-20";

  if (htmlFor) {
    return (
      <label id={id} className={className} htmlFor={htmlFor}>
        {header}
        {children}
        {footer}
      </label>
    );
  }
  return (
    <div id={id} className={className}>
      {header}
      {children}
      {footer}
    </div>
  );
}
