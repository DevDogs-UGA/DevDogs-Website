"use client";

import { toast as sonnerToast } from "sonner";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

type ToastType = "success" | "error" | "warning" | "info";

interface Props {
  id: string | number;
  message: string;
  type: ToastType;
}

/** The kit's typed toast glyph: icon and its status colour. */
const TYPES = {
  success: { Icon: CheckCircleIcon, color: "var(--ok)" },
  error: { Icon: XCircleIcon, color: "var(--bad)" },
  warning: { Icon: WarningIcon, color: "var(--warn)" },
  info: { Icon: InfoIcon, color: "var(--note)" },
} as const;

/**
 * `.toast` (kit-spec section 9): a framed card a step brighter than any
 * surface, with the status icon in its colour, the message, and a dismiss.
 * Sonner's own live region announces it, so the card carries no role.
 */
export default function Toast({ id, message, type }: Props) {
  const { Icon, color } = TYPES[type];
  return (
    <div className="toast" data-type={type}>
      <span className="toast-icon" style={{ color }} aria-hidden>
        <Icon weight="bold" />
      </span>
      <span className="min-w-0 flex-1 text-pretty">{message}</span>
      <button
        type="button"
        className="iconbtn"
        onClick={() => sonnerToast.dismiss(id)}
        aria-label="Dismiss"
      >
        <XIcon aria-hidden weight="bold" />
      </button>
    </div>
  );
}
