import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import { cn } from "~/lib/cn";

const TONES = {
  info: { cls: "", Icon: InfoIcon },
  success: { cls: "ok", Icon: CheckCircleIcon },
  warning: { cls: "warn", Icon: WarningIcon },
  critical: { cls: "bad", Icon: XCircleIcon },
} as const;

export type CalloutTone = keyof typeof TONES;

interface CalloutProps {
  tone?: CalloutTone;
  /** Bolded first line. Omit for a single-sentence notice. */
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /**
   * Announce the callout when it appears. For something the reader caused, like
   * a failed connection or a rejected upload, not for standing context.
   */
  alert?: boolean;
  id?: string;
}

/**
 * Something worth saying next to the thing it is about: a refusal, a warning,
 * a confirmation (kit `.alert`). The tone is the only thing that ought to vary.
 * The tone's icon is part of the signal, so colour is never the only cue.
 */
export default function Callout({
  tone = "info",
  title,
  children,
  className,
  alert,
  id,
}: CalloutProps) {
  const { cls, Icon } = TONES[tone];
  return (
    <div
      id={id}
      role={alert ? "alert" : undefined}
      className={cn("alert", cls, className)}
    >
      <Icon
        weight="bold"
        aria-hidden
        className="mt-px shrink-0 text-xl in-[.cosmic]:text-[var(--c,var(--note))]"
      />
      <div className="min-w-0 [&_a]:underline">
        {title && <b>{title}</b>}
        {title && children ? " " : null}
        {children}
      </div>
    </div>
  );
}
