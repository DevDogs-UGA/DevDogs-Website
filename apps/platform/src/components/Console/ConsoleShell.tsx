import "./console.css";

import type { ReactNode } from "react";
import AppSideNav from "~/components/AppSideNav";
import { AppShell } from "~/ui/app-shell";

/**
 * The shell every console page sits in: the side nav (Account, Developer and
 * Console) beside the page. The session gate stays in `console/layout.tsx` and
 * each page's own `requirePermission`; this only draws the frame.
 *
 * Each page passes its own path as `current` (a layout is not told which page
 * it wraps), the same contract as `SettingsShell`.
 */
export default function ConsoleShell({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <AppShell side={<AppSideNav current={current} />} className="con">
      {children}
    </AppShell>
  );
}
