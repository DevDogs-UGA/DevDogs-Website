import Link from "next/link";
import { Fragment } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

interface Crumb {
  label: string;
  /** Omit on the current page; the last crumb is the current page anyway. */
  href?: string;
}

/**
 * `.crumbs` (kit-spec section 7): 14px trail, links dim, the current page `b`.
 * The last item is always the current page and is not a link.
 */
function Breadcrumbs({
  items,
  className,
  "aria-label": label = "Breadcrumb",
}: {
  items: Crumb[];
  className?: string;
  "aria-label"?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      data-slot="breadcrumbs"
      aria-label={label}
      className={cn("crumbs", className)}
    >
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${i}-${crumb.label}`}>
            {i > 0 && <CaretRightIcon aria-hidden weight="bold" size={12} />}
            {last || !crumb.href ? (
              <b aria-current={last ? "page" : undefined}>{crumb.label}</b>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export { Breadcrumbs };
export type { Crumb };
