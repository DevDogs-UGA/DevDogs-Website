import "./app-shell.css";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/cn";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/**
 * `.shell` (kit-spec section 10): the side nav beside the page. Sticky at 901px
 * and up; below that the side stacks above the page as a horizontal scroller
 * with the current link first and the `.who` card and group captions hidden.
 * Wrap it in `.wrap` (the site layout's content column).
 */
function AppShell({
  side,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  side: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="app-shell"
      className={cn("wrap app-shell", className)}
      {...props}
    >
      <div className="shell">
        <aside className="side">{side}</aside>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}

/** `.who`: the signed-in member at the head of the side nav. */
function SideWho({
  avatar,
  name,
  handle,
}: {
  avatar: ReactNode;
  name: ReactNode;
  handle?: ReactNode;
}) {
  return (
    <div className="who" data-slot="side-who">
      {avatar}
      <div>
        <b>{name}</b>
        {handle && <span className="small muted">{handle}</span>}
      </div>
    </div>
  );
}

/** `.pgh`: the page heading inside the shell, with crumbs above and actions right. */
function PageHeading({
  title,
  description,
  actions,
  crumbs,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  className?: string;
}) {
  return (
    <div data-slot="page-heading" className={cn("pgh", className)}>
      <div>
        {crumbs && <Breadcrumbs items={crumbs} />}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

/** `.panel`: a flat titled group; adjacent panels are separated by a hairline. */
function Panel({
  title,
  help,
  id,
  children,
  className,
}: {
  title?: ReactNode;
  help?: ReactNode;
  id?: string;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id && title ? `${id}-h` : undefined;
  return (
    <section
      id={id}
      data-slot="panel"
      aria-labelledby={headingId}
      className={cn("panel", className)}
    >
      {title && <h2 id={headingId}>{title}</h2>}
      {help && <p className="help">{help}</p>}
      {children}
    </section>
  );
}

export { AppShell, SideWho, PageHeading, Panel };
