import "./drop-target.css";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
} from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

// Dashed "marching ants" placeholder shown in place of a list item while it's
// being dragged elsewhere. Shared by drag-and-drop lists (profile links, roles)
// so the dragging affordance stays visually consistent across the console.
export default function DropTarget({
  className = "h-17 max-w-lg",
}: {
  className?: string;
}) {
  return (
    <div className={cn("drop-target", className)}>
      <svg aria-hidden="true">
        <rect
          x="1"
          y="1"
          width="calc(100% - 2px)"
          height="calc(100% - 2px)"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 4"
          className="animate-march-dashes"
        />
      </svg>
    </div>
  );
}

/**
 * The grip a row is dragged by. Spread dnd-kit's `attributes` and `listeners`
 * onto it. Pair it with `ReorderButtons`: dragging alone is not reachable
 * from the keyboard or a screen reader.
 */
const DragGrip = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "ref">
>(function DragGrip(
  { className, "aria-label": label = "Drag to reorder", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="drag-grip"
      aria-label={label}
      className={cn("grip", className)}
      {...props}
    >
      <DotsSixVerticalIcon weight="bold" aria-hidden />
    </button>
  );
});

/** Move-up and move-down buttons: the keyboard way to reorder. */
function ReorderButtons({
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  label,
  className,
}: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** The item's name, so each button reads "Move Instagram up". */
  label?: string;
  className?: string;
}) {
  const name = label ? ` ${label}` : "";
  return (
    <span data-slot="reorder-buttons" className={cn("reorder", className)}>
      <button
        type="button"
        className="iconbtn"
        aria-label={`Move${name} up`}
        disabled={!canMoveUp}
        onClick={onMoveUp}
      >
        <ArrowUpIcon weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="iconbtn"
        aria-label={`Move${name} down`}
        disabled={!canMoveDown}
        onClick={onMoveDown}
      >
        <ArrowDownIcon weight="bold" aria-hidden />
      </button>
    </span>
  );
}

export { DragGrip, ReorderButtons };
