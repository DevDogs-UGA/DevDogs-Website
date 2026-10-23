"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";
import DevDogsSearchDialog from "~/components/DevDogsSearchDialog";
import { Kbd } from "~/ui/kbd";
import "./topnav.css";

export default function SearchButton() {
  const [open, setOpen] = useState(false);
  const [ctrl, setCtrl] = useState("Ctrl");

  useEffect(() => {
    // Platform check for the shortcut hint, once mounted (navigator is client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/mac|iphone|ipad/i.test(navigator.platform)) setCtrl("⌘");

    function onKeyDown(event: KeyboardEvent) {
      // Chrome's autofill dispatches a `keydown` with no `key` at all, despite
      // the type; reading it bare threw on every autofilled form.
      if (
        event.key?.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* One control for every width: the kit's `.search` shows the icon, the
          label and the key hint, and folds to a 40px icon button at 900px. */}
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="search relative z-10"
      >
        <MagnifyingGlassIcon aria-hidden weight="bold" />
        <span className="lbl">Search</span>
        <Kbd suppressHydrationWarning>{ctrl} K</Kbd>
      </button>

      <DevDogsSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
