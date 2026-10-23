import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";

import "./pagination.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Given a page number, the href that lands on it. */
  buildHref: (page: number) => string;
  /** Plural noun for the row count, e.g. "events". */
  label?: string;
  totalCount?: number;
}

/** Page numbers to show: the first, the last, and a window around the current. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const keep = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const pages = [...keep]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1]! > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

/**
 * The numeric pager (`.pager`, kit-spec section 7) across a paged list, with
 * the count line beside it.
 *
 * Renders nothing at one page: a lone "Page 1 of 1" with two dead arrows is
 * chrome that reports its own irrelevance.
 */
export default function Pagination({
  page,
  totalPages,
  buildHref,
  label,
  totalCount,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label ? `${label} pages` : "Pagination"}
      className="pagination-nav flex flex-wrap items-center justify-between gap-4"
    >
      <p className="small muted tabular-nums">
        Page {page} of {totalPages}
        {typeof totalCount === "number" && label && (
          <span>
            {" · "}
            {totalCount} {label}
          </span>
        )}
      </p>
      <div className="pager">
        {page > 1 ? (
          <span>
            <Link
              href={buildHref(page - 1)}
              rel="prev"
              aria-label="Previous page"
            >
              <CaretLeftIcon aria-hidden weight="bold" />
            </Link>
          </span>
        ) : (
          <span aria-disabled="true">
            <CaretLeftIcon aria-hidden weight="bold" />
          </span>
        )}
        {pageWindow(page, totalPages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} aria-hidden>
              …
            </span>
          ) : (
            <span key={n} className={n === page ? "on" : undefined}>
              <Link
                href={buildHref(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </Link>
            </span>
          ),
        )}
        {page < totalPages ? (
          <span>
            <Link href={buildHref(page + 1)} rel="next" aria-label="Next page">
              <CaretRightIcon aria-hidden weight="bold" />
            </Link>
          </span>
        ) : (
          <span aria-disabled="true">
            <CaretRightIcon aria-hidden weight="bold" />
          </span>
        )}
      </div>
    </nav>
  );
}
