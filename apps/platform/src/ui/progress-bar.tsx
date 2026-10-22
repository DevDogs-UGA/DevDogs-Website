import type { CSSProperties } from "react";

import { cn } from "~/lib/cn";
import type { EventCategory } from "~/lib/eventKind";

interface Props {
  value: number;
  max: number;
  /** Legacy hue names: amber becomes the info colour, sky the build colour. */
  fillColor?: "amber" | "sky";
  /** The event category hue; wins over `fillColor`. Omit both for the info hue. */
  kind?: EventCategory;
  className?: string;
}

/** `.progress`: a dashed pixel bar on a sunken track. */
export default function ProgressBar({
  value,
  max,
  fillColor = "amber",
  kind,
  className,
}: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const hue = kind ?? (fillColor === "sky" ? "build" : "info");
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      data-kind={hue}
      className={cn("progress w-full", className)}
      style={{ "--v": `${pct}%` } as CSSProperties}
    >
      <i className="in-[.cosmic]:max-w-[calc(100%-6px)]" />
    </div>
  );
}
