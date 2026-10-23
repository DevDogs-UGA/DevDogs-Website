"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "radix-ui";
import { PUBLIC_LINKS } from "~/config/nav";
import "./topnav.css";
import DocsMenu, { type DocsProjectLink } from "./DocsMenu";

/**
 * The kit's `.topnav nav a` look (600 15, `--text-2`, a 4px bar on the current
 * link), for links that are items of the Radix list rather than anchors in a
 * `nav`. See topnav.css.
 */
const LINK_CLASS = "topnav-link";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** The project being read, from a /docs/[project] pathname. */
function activeDocsSlug(pathname: string | null) {
  if (pathname === null) return null;
  const [, first, second] = pathname.split("/");
  return first === "docs" && second ? decodeURIComponent(second) : null;
}

/**
 * The left-hand links, as items of the navbar's single list.
 *
 * They are items rather than their own <nav> so that Docs sits in the same
 * Radix collection as the profile menu on the far right. One collection means
 * one viewport, which lets a panel travel from one trigger to the other instead
 * of blinking out and back.
 */
function Nav({
  pathname,
  docsProjects,
}: {
  pathname: string | null;
  docsProjects: DocsProjectLink[];
}) {
  return (
    <>
      {PUBLIC_LINKS.map((link) => {
        const active = pathname !== null && isActive(pathname, link.href);

        if (link.href === "/docs" && docsProjects.length > 0) {
          return (
            <DocsMenu
              key={link.href}
              label={link.label}
              active={active}
              activeSlug={activeDocsSlug(pathname)}
              projects={docsProjects}
              className={LINK_CLASS}
            />
          );
        }

        return (
          <NavigationMenu.Item
            key={link.href}
            value={link.href}
            className="flex self-stretch max-[900px]:hidden"
          >
            <NavigationMenu.Link asChild active={active}>
              <Link
                href={link.href}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                className={LINK_CLASS}
              >
                {link.label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        );
      })}
    </>
  );
}

/**
 * Static fallback for the prerendered shell. usePathname() is dynamic under
 * Cache Components, so NavLinks must render inside a <Suspense> boundary. This
 * renders the same links without active-state highlighting until the client
 * resolves the pathname.
 */
export function NavLinksFallback({
  docsProjects,
}: {
  docsProjects: DocsProjectLink[];
}) {
  return <Nav pathname={null} docsProjects={docsProjects} />;
}

export default function NavLinks({
  docsProjects,
}: {
  docsProjects: DocsProjectLink[];
}) {
  const pathname = usePathname();
  return <Nav pathname={pathname} docsProjects={docsProjects} />;
}
