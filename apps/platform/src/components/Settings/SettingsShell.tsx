import "./settings.css";

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AppSideNav from "~/components/AppSideNav";
import { expectUserWith } from "~/server/auth";
import { AppShell } from "~/ui/app-shell";

/**
 * The shell every settings page sits in: the side nav (Account, Developer and,
 * for officers, Console) beside the page. It is also the gate. A visitor who is
 * not signed in goes to `/auth` and comes back to `current`, the same
 * behaviour the old `tools` layout had.
 *
 * Each page passes its own path as `current` instead of the layout working it
 * out: a layout is not told which page it is wrapping, and only `/tools` gets
 * the `x-request-path` header from the middleware.
 */
export default async function SettingsShell({
  current,
  children,
}: {
  /** The page's own path, for the active side-nav link and the sign-in return. */
  current: string;
  children: ReactNode;
}) {
  await expectUserWith({ profile: true }).catch(() => {
    redirect(`/auth?callbackPath=${encodeURIComponent(current)}`);
  });

  return (
    <AppShell
      side={<AppSideNav current={current} />}
      className="settings-shell"
    >
      {children}
    </AppShell>
  );
}
