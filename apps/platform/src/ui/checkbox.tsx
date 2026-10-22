import "./fields.css";
import * as React from "react";
import { CheckIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

type CheckboxProps = Omit<
  React.ComponentProps<"input">,
  "type" | "children"
> & {
  /** `radio` draws the pixel-round `.check.radio`. */
  type?: "checkbox" | "radio";
  /** Visible text. Omit it and pass `aria-label` for a bare box. */
  label?: React.ReactNode;
  /** Classes for the wrapping `<label>`; `className` is for the input. */
  wrapperClassName?: string;
};

/**
 * The kit's `.check`: a real `<input type=checkbox|radio>`, visually hidden but
 * focusable, with the stepped square (or pixel-round dot) drawn as a sibling.
 * Checked and focus states come from the input via CSS (`fields.css`), so it
 * works controlled or uncontrolled with no state of its own. `aria-invalid`
 * outlines the unchecked box in the invalid colour.
 */
function Checkbox({
  type = "checkbox",
  label,
  className,
  wrapperClassName,
  "aria-invalid": ariaInvalid,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={cn("check", type === "radio" && "radio", wrapperClassName)}
      data-invalid={ariaInvalid === true || ariaInvalid === "true" || undefined}
    >
      <input
        type={type}
        data-slot={type}
        aria-invalid={ariaInvalid}
        className={className}
        {...props}
      />
      <i aria-hidden>{type === "checkbox" && <CheckIcon weight="bold" />}</i>
      {label}
    </label>
  );
}

function Radio(props: Omit<CheckboxProps, "type">) {
  return <Checkbox {...props} type="radio" />;
}

export { Checkbox, Radio };
export type { CheckboxProps };
