"use client";

import { DotsNineIcon } from "@phosphor-icons/react/ssr";
import { AppSwitcherTrigger } from "~/components/AppSwitcher/provider";

export default function AppSwitcherButton() {
  return (
    <AppSwitcherTrigger>
      <button
        type="button"
        className="btn ghost icon sm relative z-10 max-[900px]:hidden"
      >
        <DotsNineIcon weight="bold" />
      </button>
    </AppSwitcherTrigger>
  );
}
