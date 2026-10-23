"use client";

import "./fields.css";
import { useFormStatus } from "react-dom";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";

interface Props {
  /**
   * The current state of the toggle. The button submits the opposite value,
   * the state-to-be: `on` when unchecked, nothing at all when checked.
   */
  checked: boolean;
  /**
   * The `name` submitted with the form, carried on the button itself. Without
   * it the button submits no value, which is what forms that manage their own
   * intent input want, as in OAuthCredentialsField.
   */
  name?: string;
  /**
   * Overrides the `useFormStatus` pending state. Pass it when pending is
   * managed externally, e.g. `useActionState` across multiple forms.
   */
  pending?: boolean;
  disabled?: boolean;
  /** Names the switch when no wrapping `<label>` does. */
  "aria-label"?: string;
}

/**
 * The kit's `.switch`: a 44x24 stepped track, 16px knob. A submit button with
 * `role="switch"`. The knob follows `checked` only: while a submit is pending it
 * stays where it is and a spinner turns in it, so the control never shows a
 * state the server has not confirmed.
 */
export default function Toggle({
  checked,
  name,
  pending: pendingProp,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;

  return (
    <button
      className={checked ? "switch on isolate" : "switch isolate"}
      type="submit"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      name={checked ? undefined : name}
      value={checked ? undefined : "on"}
      disabled={disabled}
      data-on={checked || undefined}
      data-pending={pending || undefined}
      data-enabled={checked || undefined}
    >
      {pending && (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 z-[1] grid size-4 place-items-center ${
            checked ? "left-6 text-[var(--k6)]" : "left-1 text-[var(--bg)]"
          }`}
        >
          <SpinnerGapIcon
            weight="bold"
            className="size-3 animate-spin [animation-duration:750ms] motion-reduce:animate-none"
          />
        </span>
      )}
    </button>
  );
}
