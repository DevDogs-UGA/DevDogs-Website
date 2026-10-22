import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "~/lib/cn";

interface StatTileProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> {
  /** The small caption above the number. */
  label: ReactNode;
  /** An icon shown before the label. */
  icon?: ReactNode;
  /** The big number (tabular, Alan Sans). */
  value: ReactNode;
  /** A quiet suffix beside the number, such as "of 24". */
  of?: ReactNode;
  /** A line under the number. */
  sub?: ReactNode;
}

/** `.tile`: a quiet stat with no frame. Lay several out in `<StatTiles>`. */
function StatTile({
  label,
  icon,
  value,
  of,
  sub,
  className,
  ...props
}: StatTileProps) {
  return (
    <div data-slot="stat-tile" className={cn("tile", className)} {...props}>
      <div className="lbl">
        {icon}
        {label}
      </div>
      <div className="num">
        {value}
        {of != null && <span className="of">{of}</span>}
      </div>
      {sub != null && (
        <div className="mt-1.5 text-[13px] text-[var(--text-3)]">{sub}</div>
      )}
    </div>
  );
}

/** `.tiles`: the auto-fit grid of tiles. */
function StatTiles({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div data-slot="stat-tiles" className={cn("tiles", className)} {...props} />
  );
}

export { StatTile, StatTiles };
export default StatTile;
