"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { SwitcherEntry } from "~/config/nav";
import OpenOrShareDialog from "./OpenOrShareDialog";
import { Card } from "~/ui/card";
import { LIFT, ROW } from "./rowStyles";

/**
 * An external listing. Pressing the row asks whether to open or share, the
 * same question the project tiles ask. The row leads with the site's
 * favicon, which says where the link lands better than a generic link icon,
 * and trails an arrow that says it leaves the page.
 *
 * Rows are the kit's framed card laid out as a row. Plain rows are neutral;
 * `featured` rows take the info hue and add their `description`.
 */
export default function EntryButton({ entry }: { entry: SwitcherEntry }) {
  const [open, setOpen] = useState(false);
  const Arrow = entry.external ? ArrowUpRightIcon : ArrowRightIcon;

  return (
    <>
      <Card
        kind={entry.featured ? "info" : undefined}
        className={`${ROW} ${LIFT}`}
      >
        {/* A fixed slot, so labels line up whether or not a row has a
            favicon. */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          {entry.favicon && (
            <Image
              src={entry.favicon}
              alt=""
              className="size-5"
              // Rendered at 20px from a 64px source, so no pipeline pass is
              // needed. That is also why there is no `sizes`: `unoptimized`
              // emits a bare src and drops srcset and sizes both, so one here
              // would be dead weight. The static import still carries its
              // intrinsic 64×64, so the box is reserved before the file lands.
              unoptimized
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          {/* The button wraps the label and stretches over the whole row with
              its own ::after, so the row is one control. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="switcher-hit"
          >
            {entry.label}
          </button>
          {entry.featured && entry.description && (
            <span className="small muted">{entry.description}</span>
          )}
        </span>
        <Arrow weight="bold" aria-hidden className="size-4 shrink-0" />
      </Card>
      <OpenOrShareDialog
        title={entry.label}
        url={entry.href}
        external={entry.external ?? false}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
