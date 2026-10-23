"use client";

import { GearIcon, ListIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ACCOUNT_ITEMS, PROFILE_ITEMS } from "~/config/nav";
import MobileSheet from "./MobileSheet";
import { useMe } from "./NavUserProvider";
import ProfilePopover from "./ProfilePopover";
import SignInButton, { JoinButton } from "./SignInButton";
import UserClusterSkeleton from "./UserClusterSkeleton";

/**
 * The per-viewer slice of the navbar. The server renders the loading state
 * (pages read no session, so they can be cached), and `/me` fills it in after
 * hydration; see `NavUserProvider`.
 */
export function TopNavProfile() {
  const me = useMe();

  // These land inside the navbar's right-hand cluster, which is already one
  // <li>, so they render plainly.
  if (me === undefined) return <UserClusterSkeleton />;
  if (me === null) {
    return (
      <>
        {/* Below 520px it lives in the mobile menu, to keep the bar on one row. */}
        <SignInButton className="max-[520px]:hidden" />
        <JoinButton />
      </>
    );
  }

  const consoleHome = me.consoleItems[0];

  return (
    <>
      {consoleHome && (
        <Link
          href={consoleHome.href}
          className="btn ghost sm max-[900px]:hidden"
        >
          <GearIcon weight="bold" />
          Console
        </Link>
      )}
      <ProfilePopover
        user={me.user}
        items={ACCOUNT_ITEMS}
        consoleItems={me.consoleItems}
      />
    </>
  );
}

export function TopNavMobile() {
  const me = useMe();

  if (me === undefined) {
    return (
      <span aria-hidden className="navtoggle btn ghost icon sm shrink-0">
        <ListIcon weight="bold" />
      </span>
    );
  }

  return (
    <MobileSheet
      consoleItems={me?.consoleItems ?? []}
      profileItems={PROFILE_ITEMS}
      signedIn={me !== null}
    />
  );
}
