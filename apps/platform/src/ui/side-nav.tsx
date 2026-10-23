import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/cn";
import "./side-nav.css";

/** The kit styles icons through its own `<x-icon>` element; React renders the glyph inside one. */
const XIcon = "x-icon" as unknown as React.ElementType;

/**
 * `.sidenav` (kit-spec sections 7 and 10): a column of links under small-caps
 * group captions. The current link is the whole row tinted, with no side stripe.
 * It replaces the unused `ui/sidebar.tsx`.
 */
function SideNav({
  className,
  "aria-label": label = "Section",
  ...props
}: ComponentProps<"nav">) {
  return (
    <nav
      data-slot="side-nav"
      aria-label={label}
      className={cn("sidenav", className)}
      {...props}
    />
  );
}

/** `.grp`: a caption above a run of links. */
function SideNavGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="side-nav-group"
      className={cn("grp", className)}
      {...props}
    />
  );
}

interface SideNavLinkProps extends Omit<ComponentProps<typeof Link>, "href"> {
  href: string;
  /** The link for the page being read. */
  active?: boolean;
  /** A Phosphor glyph, rendered in the kit's icon slot. */
  icon?: ReactNode;
  /** A count pushed to the right (`.n`). */
  count?: number | string;
}

function SideNavLink({
  active,
  icon,
  count,
  className,
  children,
  ...props
}: SideNavLinkProps) {
  return (
    <Link
      data-slot="side-nav-link"
      aria-current={active ? "page" : undefined}
      className={cn(active && "on", className)}
      {...props}
    >
      {icon && <XIcon>{icon}</XIcon>}
      {children}
      {count !== undefined && <span className="n">{count}</span>}
    </Link>
  );
}

export { SideNav, SideNavGroup, SideNavLink };
export type { SideNavLinkProps };
