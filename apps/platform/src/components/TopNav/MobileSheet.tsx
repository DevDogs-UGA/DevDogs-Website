"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DotsNineIcon, ListIcon } from "@phosphor-icons/react/ssr";
import { AppSwitcherTrigger } from "~/components/AppSwitcher/provider";
import * as icons from "~/config/icons";
import {
  PUBLIC_LINKS,
  SOCIAL_LINKS,
  type ConsoleItem,
  type NavItem,
} from "~/config/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import { SideNav, SideNavGroup, SideNavLink } from "~/ui/side-nav";
import "./topnav.css";

interface Props {
  consoleItems: ConsoleItem[];
  profileItems: NavItem[];
  signedIn: boolean;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** A captioned run of icon links, in the kit's side-nav look. */
function SheetSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <SideNav aria-label={title}>
      <SideNavGroup>{title}</SideNavGroup>
      {items.map((item) => {
        const Icon = icons[item.icon];
        return (
          <SideNavLink
            key={item.href}
            href={item.href}
            icon={<Icon weight="bold" />}
            active={isActive(pathname, item.href)}
            onClick={onNavigate}
          >
            {item.label}
          </SideNavLink>
        );
      })}
    </SideNav>
  );
}

export default function MobileSheet({
  consoleItems,
  profileItems,
  signedIn,
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close when navigation completes (covers back/forward too).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="navtoggle btn ghost icon sm shrink-0"
      >
        <ListIcon weight="bold" />
      </SheetTrigger>

      {/* The plain panel, not the 480px drawer: it is the mockup's `.mnav`
          column, on the same side as the toggle. */}
      <SheetContent
        side="left"
        variant="panel"
        className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <SheetHeader className="p-4">
          <SheetTitle className="text-left">Menu</SheetTitle>
        </SheetHeader>

        <div className="tn-mobile">
          <nav className="mnav open" aria-label="Main">
            {PUBLIC_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? "on" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {consoleItems.length > 0 && (
            <SheetSection
              title="Console"
              items={consoleItems}
              pathname={pathname}
              onNavigate={close}
            />
          )}

          {signedIn && (
            <SheetSection
              title="You"
              items={profileItems}
              pathname={pathname}
              onNavigate={close}
            />
          )}

          {!signedIn && (
            <Link
              href="/auth"
              prefetch={false}
              onClick={close}
              className="btn primary sm"
            >
              Sign in
            </Link>
          )}

          <AppSwitcherTrigger>
            <button type="button" onClick={close} className="btn secondary sm">
              <DotsNineIcon weight="bold" />
              More from DevDogs
            </button>
          </AppSwitcherTrigger>

          <div className="tn-mobile-foot">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon ? icons[social.icon] : null;
              return (
                <Link
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  aria-label={social.label}
                  className="iconbtn"
                >
                  {Icon && <Icon />}
                </Link>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
