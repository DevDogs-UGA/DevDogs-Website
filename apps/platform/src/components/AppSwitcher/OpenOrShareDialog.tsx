"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react/ssr";
import { useShare } from "~/lib/useShare";
import { Button, buttonVariants } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

interface Props {
  /** Names the link: the dialog's title, and the label the share sheet gets. */
  title: string;
  url: string;
  external: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dismisses the switcher overlay once an in-app link is followed. */
  onNavigate?: () => void;
}

/**
 * Name an absolute outbound destination when we can. Some outbound controls
 * deliberately use a same-origin redirect (for example `/leadership`) so the
 * target can change in one place. Those paths are still external links, but
 * they are not valid inputs to the one-argument URL constructor.
 */
export function describeExternalDestination(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname) return `This link goes to ${hostname}.`;
  } catch {
    // A relative redirect has no hostname until the server follows it.
  }

  return "This link opens outside this site.";
}

/**
 * The question every switcher link asks when pressed: follow it, or share it?
 *
 * Asking outright replaced a long press only touch could reach and a
 * hover-revealed button only a mouse could see. One affordance, the same on
 * every device, and the share runs from a plain button click, inside the user
 * activation the share sheet demands.
 */
export default function OpenOrShareDialog({
  title,
  url,
  external,
  open,
  onOpenChange,
  onNavigate,
}: Props) {
  const share = useShare({ title, url });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Above the switcher's z-100 overlay. */}
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-110"
        className="z-110 sm:max-w-xs"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {external
              ? describeExternalDestination(url)
              : "This link stays on this site."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {/* Share on the left, so the primary action ends the row. */}
          <Button
            variant="secondary"
            onClick={() => {
              // The share first, while the click's user activation is fresh.
              // Closing is cleanup and can happen behind it.
              share();
              onOpenChange(false);
            }}
          >
            Share <ShareNetworkIcon weight="bold" />
          </Button>
          {external ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpenChange(false)}
              className={buttonVariants({ variant: "default" })}
            >
              Open <ArrowSquareOutIcon weight="bold" />
            </a>
          ) : (
            <Link
              href={url}
              onClick={() => {
                onOpenChange(false);
                onNavigate?.();
              }}
              className={buttonVariants({ variant: "default" })}
            >
              Open <ArrowRightIcon weight="bold" />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
