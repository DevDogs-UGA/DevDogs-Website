"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  MegaphoneIcon,
} from "@phosphor-icons/react/ssr";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_STORAGE_KEY,
  showsAnnouncement,
  type AnnouncementTone,
} from "~/config/announcement";
import { cn } from "~/lib/cn";
import type { EventCategory } from "~/lib/eventKind";
import { buttonVariants } from "~/ui/button";
import { Card } from "~/ui/card";

/**
 * Each tone takes an event category's hue for the card's ring, the tab and the
 * megaphone's dot (kit-spec section 3: a card rings and shadows itself in one
 * category). Urgent is the info hue (amber), the plain notice the build hue.
 */
const TONE_KIND: Record<AnnouncementTone, EventCategory> = {
  urgent: "info",
  info: "build",
};

/**
 * How far the notice has to be dragged down before letting go closes it.
 * 50px is Radix Toast's default swipe threshold, which is a well-worn number
 * for exactly this gesture.
 */
const SWIPE_CLOSE_DISTANCE = 50;

/** How long the notice takes to leave, and to spring back from a short drag. */
const EXIT_MS = 200;

/** Travel before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 4;

function isAnnouncementExpired() {
  return (
    ANNOUNCEMENT !== null &&
    Date.now() > new Date(ANNOUNCEMENT.expiresAt).getTime()
  );
}

function subscribeToExpiration(onChange: () => void) {
  if (!ANNOUNCEMENT) return () => undefined;

  const remaining = new Date(ANNOUNCEMENT.expiresAt).getTime() - Date.now();
  if (remaining <= 0) return () => undefined;

  const timer = setTimeout(onChange, remaining);
  return () => clearTimeout(timer);
}

/**
 * The dismiss cross, drawn here rather than taken from Phosphor.
 *
 * Phosphor's ladder tops out at `bold`, and beside the tab's display type
 * that still read as the lighter of the two. Its weights are 8 / 12 / 16 / 24
 * of stroke in a 256 box; at the tab's `size-3` a 24 renders about 1.1px
 * against a stem of roughly 1.5px in the eyebrow beside it, which is the gap
 * you can see. 32 is the next rung on Phosphor's own ratio and lands on that
 * stem.
 *
 * The arms run 64 to 192 so the round caps put the extent at 48 to 208,
 * exactly where Phosphor's X sits, so this drops in at the same optical size.
 */
function DismissCross({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={32}
      strokeLinecap="round"
      className={className}
    >
      <path d="M64 64 192 192M192 64 64 192" />
    </svg>
  );
}

/**
 * The notice itself: the card with its action and the tab that dismisses it.
 * Split from the banner's fixed positioning and swipe handling so the kit
 * gallery can show it in place.
 */
export function AnnouncementNotice({
  tone,
  eyebrow,
  message,
  action,
  onDismiss,
}: {
  tone: AnnouncementTone;
  eyebrow: string;
  message: string;
  action: { href: string; label: string; external?: boolean };
  onDismiss: () => void;
}) {
  const kind = TONE_KIND[tone];
  return (
    <>
      <Card
        kind={kind}
        className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative flex shrink-0">
            {/* Mirrored: Phosphor's megaphone points right, which aims it
          off the edge of the card. Flipped, it points into the copy. */}
            <MegaphoneIcon weight="bold" className="size-6 -scale-x-100" />
            {/* Unread-style badge, as over the user avatar in the nav.

          Do not animate it. It used to be a full disc behind the icon
          that pulsed with `animate-ping`, and the pulse had to go: the
          badge sits in a fixed banner right beside the scrim's
          `backdrop-filter`, and repainting it every frame forces that
          1440x144 surface to re-filter behind it. The glass is the
          half worth keeping. */}
            <span
              aria-hidden
              data-kind={kind}
              className="absolute -top-0.5 -right-0.5 size-2.5 bg-[var(--k3)] ring-2 ring-[var(--surface)]"
            />
          </span>

          {/* max-w-prose caps the measure. The card runs to max-w-4xl so it
        has room for the action button on the same row, but a line of
        copy that wide is a chore to read, so the text stops at a
        comfortable measure and wraps and the leftover width stays
        with the button. */}
          <p className="max-w-prose min-w-0 font-semibold text-balance">
            {message}
          </p>
        </div>

        <Link
          href={action.href}
          // The current /leadership action redirects off-site, so Next
          // must not follow it speculatively while the banner is visible.
          prefetch={false}
          {...(action.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className={cn(
            buttonVariants({ variant: "default", size: "sm", kind }),
            "shrink-0 self-end sm:self-auto",
          )}
        >
          {action.label}
          {action.external ? (
            <ArrowSquareOutIcon weight="bold" />
          ) : (
            <ArrowRightIcon weight="bold" />
          )}
        </Link>
      </Card>

      {/* The tab, which is also the dismiss control. The X lives here
      rather than in the action row, so the notice has exactly one
      close affordance and the row is left to the one thing it wants
      you to do. It is the kit's chip in the card's hue, sitting on
      the card's top edge. */}
      <button
        type="button"
        onClick={onDismiss}
        /* The eyebrow is inside the control, so the label has to carry
       both. "Now open, button" would say nothing about what pressing
       it does, and a bare "Dismiss announcement" would drop the
       eyebrow from the accessible name entirely. */
        aria-label={`${eyebrow} — dismiss announcement`}
        data-kind={kind}
        className="chip absolute bottom-full left-4 mb-1.5 cursor-pointer pointer-coarse:min-h-11"
      >
        <DismissCross className="size-3" />
        {eyebrow}
      </button>
    </>
  );
}

export default function AnnouncementBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const expired = useSyncExternalStore(
    subscribeToExpiration,
    isAnnouncementExpired,
    () => false,
  );
  /** Offset while a finger is on the notice; null when nothing is dragging. */
  const [dragY, setDragY] = useState<number | null>(null);
  /** Set once dismissal is committed to, while the exit plays out. */
  const [closing, setClosing] = useState(false);
  const dragStart = useRef<{
    y: number;
    pointerId: number;
    captured: boolean;
  } | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!ANNOUNCEMENT || expired || dismissed || !showsAnnouncement(pathname))
    return null;

  const { id, eyebrow, message, action, tone } = ANNOUNCEMENT;
  const commitDismissal = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, id);
    } catch {
      // Session storage unavailable (private-mode restrictions, cookies
      // blocked). The card still closes for this page view; it just comes back
      // on the next load, which is the honest failure direction for a notice.
    }
  };

  /**
   * Both ways out, pressing the tab and swiping down, run the exit first and
   * commit on a timer rather than on transitionend, which never fires if the
   * transition is interrupted or optimised away and would strand the notice
   * on screen for good.
   */
  const startDismiss = () => {
    if (closing) return;
    setClosing(true);
    exitTimer.current = setTimeout(commitDismissal, EXIT_MS);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Mouse sits this out deliberately: a click-drag across a card of text
    // fights text selection, and this gesture is asking for a finger.
    if (closing || event.pointerType === "mouse") return;
    dragStart.current = {
      y: event.clientY,
      pointerId: event.pointerId,
      captured: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (start?.pointerId !== event.pointerId) return;
    const distance = event.clientY - start.y;

    // Capture only once the finger has actually travelled, never on the way
    // down. Capturing on pointerdown re-targets the click that follows, which
    // would break tapping the tab and the action button, the two things most
    // people touch this notice for.
    if (!start.captured) {
      if (Math.abs(distance) < DRAG_SLOP) return;
      start.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // Down tracks the finger exactly; up is heavily damped, since there is
    // nothing above for the notice to go to and it should feel like it knows.
    setDragY(distance > 0 ? distance : distance / 6);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (start?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    const distance = event.clientY - start.y;
    setDragY(null);
    // A press that never became a drag is a tap; leave it to the click.
    if (start.captured && distance >= SWIPE_CLOSE_DISTANCE) startDismiss();
  };

  return (
    <>
      {/* z-40 puts the notice over the page but under the z-50 dialog and
          sheet overlays, so opening a dialog dims it along with everything
          else, and under sonner's toasts (bottom-right, and on their own very
          high z-index), so a toast is never buried by it.

          The gutter is pointer-events-none: it spans the whole viewport width
          and would otherwise swallow clicks on whatever sits behind it.

          The side padding does not step down on a narrow screen the way the
          vertical padding does: the card's ring is dark and the page it floats
          over is darker, so a thin gutter reads as no gutter at all. */}
      <div
        data-slot="announcement-banner"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-6 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {/* Scrim. It grounds the notice against whatever is scrolling under it
            and gives the card's black border something other than page text
            to sit on.

            The blur has to fade out, and `backdrop-filter` takes no gradient,
            so the gradient goes on a `mask-image` instead, which is applied to
            this element's composited result and therefore fades the blur and
            the darkening together, in one pass. Tailwind emits the -webkit-
            prefixed property alongside the standard one, so old Safari is
            covered without a second class.

            Height: it hangs 4/6 above the gutter's box, which is the same step
            as the gutter's own padding, so the distance it reaches past the
            top of the notice is the gap below it, mirrored. The extra also
            covers the tab, which hangs above the gutter's box and would
            otherwise sit on the scrim's hard edge.

            No z-index: like the tab, it just takes its place in DOM order,
            first child, so both the card and the tab paint over it. */}
        <div
          aria-hidden
          style={
            closing
              ? { opacity: 0, transition: `opacity ${EXIT_MS}ms ease-out` }
              : undefined
          }
          className="animate-in fade-in pointer-events-none absolute inset-x-0 -top-4 bottom-0 bg-black/50 [mask-image:linear-gradient(to_top,#000_0%,#000_20%,transparent_100%)] duration-500 supports-backdrop-filter:backdrop-blur-sm motion-reduce:animate-none md:-top-6"
        />

        {/* The landmark wraps card AND tab, so a screen reader reads the
            eyebrow as part of the notice rather than as loose text beside it.
            It also carries the entrance animation, so the tab rises with the
            card instead of being left behind, and it must NOT clip: the tab
            hangs above its box. */}
        <aside
          aria-label="Club announcement"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            translate: closing
              ? "0 140%"
              : dragY !== null
                ? `0 ${dragY}px`
                : undefined,
            opacity: closing ? 0 : undefined,
            // Inline, so it beats every utility. While a finger is down there
            // must be no transition at all or the notice lags behind it; and
            // Tailwind's duration-* would collide with the entrance
            // animation's own duration token on this same element.
            transition:
              dragY === null
                ? `translate ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`
                : "none",
          }}
          /* touch-none hands us the vertical drag instead of scrolling the
             page with it, the same trade Radix Toast makes. It costs the
             ability to scroll by starting the drag on the notice itself. */
          className="animate-in slide-in-from-bottom-6 fade-in pointer-events-auto relative mx-auto max-w-4xl touch-none duration-500 motion-reduce:animate-none"
        >
          <AnnouncementNotice
            tone={tone}
            eyebrow={eyebrow}
            message={message}
            action={action}
            onDismiss={startDismiss}
          />
        </aside>
      </div>
    </>
  );
}
