import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { visibleConsoleItems } from "~/config/nav";
import { getCallerContext } from "~/server/actions/permissions";
import { requireSession } from "~/server/auth/require";

/**
 * One `robots` for the whole console, declared here rather than on each of the
 * eight pages below it. Metadata merges shallowly down the segment tree, so a
 * page that exports only a `title` keeps this, which is why a layout is the
 * right place for it: a console page added tomorrow is noindex by default
 * instead of by someone remembering.
 *
 * This is defence in depth, not the gate. `/console` is disallowed in
 * `robots.txt` and every page checks a permission flag server-side. `noindex`
 * covers the case those two miss: a URL that reached an index some other way,
 * pasted into a public channel or found by a crawler that ignores robots.txt.
 *
 * The default title is deliberately generic and every page overrides it. It is
 * only ever seen on a route with no `metadata` of its own.
 */
export const metadata: Metadata = {
  title: "Console | DevDogs",
  robots: { index: false },
};

/**
 * Wraps every `/console` page and holds their one shared gate: a session, and
 * at least one console permission.
 *
 * A signed-out visitor gets the 404 and a member with no console permission
 * gets the access-denied card, checked once here rather than at the top of each
 * page: a page added under this route later cannot forget it. What each page
 * needs *beyond* that differs (moderation, audit-log and permissions want three different flags),
 * so the specific check stays with the page that knows which one it is. See
 * `~/server/auth/require`.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireSession();
  const { resolvedPermissions } = await getCallerContext(userId);
  if (visibleConsoleItems(resolvedPermissions).length === 0) forbidden();

  return (
    <div className="flex min-w-0 flex-1 flex-col *:w-full">{children}</div>
  );
}
