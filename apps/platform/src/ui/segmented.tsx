"use client";

import "./fields.css";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { cn } from "~/lib/cn";

interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Renders the segment as a link (events List / Month); `value` marks the current one. */
  href?: string;
}

interface SegmentedProps {
  options: readonly SegmentedOption[];
  /** Names the group for assistive tech ("View"). Required: there is no visible legend. */
  "aria-label": string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Form field name for the radios. */
  name?: string;
  className?: string;
}

/**
 * The kit's `.seg`: a segmented control. Options without `href` are a real
 * radio group (arrow keys move and select); options with `href` are links, and
 * the one whose `value` equals `value` gets `aria-current="page"`.
 */
function Segmented({
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  name,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value);
  const current = controlled ?? own;
  const groupName = useId();
  const asLinks = options.some((o) => o.href);

  return (
    <span
      className={cn("seg", className)}
      role={asLinks ? "group" : "radiogroup"}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const on = option.value === current;
        if (option.href) {
          return (
            <span key={option.value} className={on ? "on" : undefined}>
              <Link href={option.href} aria-current={on ? "page" : undefined}>
                {option.label}
              </Link>
            </span>
          );
        }
        const id = `${groupName}-${option.value}`;
        return (
          <span key={option.value} className={on ? "on" : undefined}>
            <input
              id={id}
              type="radio"
              name={name ?? groupName}
              value={option.value}
              checked={on}
              disabled={option.disabled}
              onChange={() => {
                setOwn(option.value);
                onValueChange?.(option.value);
              }}
            />
            <label htmlFor={id}>{option.label}</label>
          </span>
        );
      })}
    </span>
  );
}

export { Segmented };
export type { SegmentedOption, SegmentedProps };
