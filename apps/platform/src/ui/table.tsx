import "./table.css";

import type * as React from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
} from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

type SortDirection = "ascending" | "descending" | "none";

/**
 * `.tablewrap > table.table`: an open table (heavy header rule, light row
 * rules) that scrolls sideways inside its own wrapper, so a `menu` cell can
 * stay pinned at the right edge. `caption` is read by screen readers only.
 */
function Table({
  caption,
  wrapperClassName,
  className,
  children,
  ...props
}: React.ComponentProps<"table"> & {
  caption?: React.ReactNode;
  wrapperClassName?: string;
}) {
  return (
    <div data-slot="table-wrap" className={cn("tablewrap", wrapperClassName)}>
      <table data-slot="table" className={cn("table", className)} {...props}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

function THead(props: React.ComponentProps<"thead">) {
  return <thead data-slot="table-head" {...props} />;
}

function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />;
}

/** A row; `selected` is the brand-barred `tr.sel`. */
function Tr({
  selected,
  className,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected ? true : undefined}
      className={cn(selected && "sel", className)}
      {...props}
    />
  );
}

type ThProps = Omit<React.ComponentProps<"th">, "onClick"> & {
  /** Right-align and use tabular figures. */
  num?: boolean;
  /** The pinned row-menu column: sticky at the right edge. */
  menu?: boolean;
  /**
   * Makes the header sortable and sets `aria-sort`: the column's current
   * direction, `"none"` when sortable but unsorted.
   */
  sort?: SortDirection;
  /** Sort by a button (client state)... */
  onSort?: () => void;
  /** ...or by a link (URL state). */
  sortHref?: string;
};

function Th({
  num,
  menu,
  sort,
  onSort,
  sortHref,
  className,
  children,
  ...props
}: ThProps) {
  const sortable = sort !== undefined;
  const Icon =
    sort === "ascending"
      ? ArrowUpIcon
      : sort === "descending"
        ? ArrowDownIcon
        : ArrowsDownUpIcon;
  const inner = (
    <>
      {children}
      <Icon weight="bold" aria-hidden />
    </>
  );
  return (
    <th
      data-slot="table-header"
      scope="col"
      aria-sort={sortable ? sort : undefined}
      className={cn(
        num && "num",
        menu && "menu-cell",
        sortable && "sort",
        sortable && sort !== "none" && "on",
        className,
      )}
      {...props}
    >
      {!sortable ? (
        children
      ) : sortHref ? (
        <Link href={sortHref}>{inner}</Link>
      ) : (
        <button type="button" onClick={onSort}>
          {inner}
        </button>
      )}
    </th>
  );
}

/** A cell. `strong` is the row's name column, `wrap` lets long text wrap. */
function Td({
  strong,
  num,
  wrap,
  menu,
  className,
  ...props
}: React.ComponentProps<"td"> & {
  strong?: boolean;
  num?: boolean;
  wrap?: boolean;
  menu?: boolean;
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        strong && "strong",
        num && "num",
        wrap && "wrap",
        menu && "menu-cell",
        className,
      )}
      {...props}
    />
  );
}

/** `.selbar`: the bulk-selection strip above a table. */
function SelectionBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="selection-bar"
      role="status"
      className={cn("selbar", className)}
      {...props}
    />
  );
}

export { Table, THead, TBody, Tr, Th, Td, SelectionBar };
export type { SortDirection };
