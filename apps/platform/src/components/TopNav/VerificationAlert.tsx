"use client";

import { ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import ProgressBar from "~/ui/progress-bar";
import { useVerification } from "./NavUserProvider";
import "./topnav.css";

/** The profile menu's setup nudge: the kit's warn colour on a framed button. */
export default function VerificationAlert() {
  const ctx = useVerification();
  if (!ctx || ctx.isVerified) return null;

  const { completed, total, openDialog, publicProfiles } = ctx;

  return (
    <button type="button" onClick={openDialog} className="alert warn tn-verify">
      <span>
        <ShieldWarningIcon weight="bold" className="shrink-0" />
        Finish Account Setup
      </span>
      <ProgressBar value={completed} max={total} fillColor="amber" />
      <span>
        {completed}/{total} steps complete
        {publicProfiles ? ". Verify to be listed on the community page." : ""}
      </span>
    </button>
  );
}
