import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/cn";

/**
 * `.tabs` (kit-spec section 7): a row of links with a 2px rule underneath and a
 * 4px underline on the current one. These are navigation, not a tablist: each
 * tab is a link to its own URL, so the current one carries `aria-current`
 * rather than `role="tab"`.
 */
function Tabs({
  className,
  "aria-label": label = "Sections",
  ...props
}: ComponentProps<"nav">) {
  return (
    <nav
      data-slot="tabs"
      aria-label={label}
      className={cn("tabs", className)}
      {...props}
    />
  );
}

interface TabProps extends Omit<ComponentProps<typeof Link>, "href"> {
  href: string;
  /** The tab for the page being read. */
  active?: boolean;
  icon?: ReactNode;
}

function Tab({ active, icon, className, children, ...props }: TabProps) {
  return (
    <Link
      data-slot="tab"
      aria-current={active ? "page" : undefined}
      className={cn(active && "on", className)}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}

export { Tabs, Tab };
export type { TabProps };
