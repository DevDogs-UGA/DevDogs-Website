"use client";

import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "~/ui/button";
import { computeClusterLayout } from "./clusterLayout";
import {
  CARD_H,
  CARD_W,
  CONTAINER_H,
  CONTAINER_W,
  hitTest,
  holdsPointer,
  openRegion,
  openShiftX,
  popupPlacement,
  popupSideFor,
  repelOffset,
  type Point,
} from "./geometry";
import { formatLeaderMeta, type LeaderProfile } from "./profile";
import Helmet from "./Helmet";
import LeaderDetails from "./LeaderDetails";
import LeaderTile from "./LeaderTile";

interface Props {
  profiles: LeaderProfile[];
}

const WIDE = "(min-width: 1024px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/** A `matchMedia` query as external state; the server answers `false`. */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The fan of officers, as helmets on the starfield.
 *
 * From 1024px up it is the hover cluster: all state lives in one `open` index,
 * driven by hit-testing the pointer against the layout `./geometry` computes
 * from that same state, never by mouseenter on the helmets, which move. An open
 * helmet holds the pointer while it stays inside the helmet + popup region,
 * which is what lets the mouse cross the gap into the popup with no close
 * timers, hover locks or invisible bridge elements. Keyboard gets the same
 * states: focusing a tile opens it, its popup is next in tab order, Escape or
 * focus leaving the cluster closes.
 *
 * Below 1024px the helmets wrap in a flow and a tap opens the details in a
 * bottom sheet (a native `<dialog>`).
 *
 * The positions are inline custom properties (`left`, `top`, `--tf`, `--op`)
 * that only the 1024px+ rules read, so the server's HTML already has the fan in
 * place and hydration moves nothing.
 */
export default function LeaderCluster({ profiles }: Props) {
  const wide = useMedia(WIDE);
  const reduced = useMedia(REDUCED);
  const [open, setOpen] = useState<number | null>(null);
  const [was, setWas] = useState<ReadonlySet<number>>(() => new Set());
  const [sheet, setSheet] = useState<number | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const popupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const layout = useMemo(
    () => computeClusterLayout(profiles.length),
    [profiles.length],
  );
  const openLayout = open === null ? undefined : layout[open];

  function change(next: number | null) {
    if (next === open) return;
    if (open !== null) {
      const previous = open;
      setWas((current) => new Set(current).add(previous));
    }
    setOpen(next);
  }

  function handlePointer(e: ReactPointerEvent<HTMLDivElement>) {
    if (!wide) return;
    const box = clusterRef.current?.getBoundingClientRect();
    if (!box) return;
    const p: Point = { x: e.clientX - box.left, y: e.clientY - box.top };

    if (openLayout) {
      const shift = reduced ? 0 : openShiftX(popupSideFor(openLayout));
      if (holdsPointer(openRegion(openLayout, shift), p)) return;
      const popup = open === null ? null : popupRefs.current[open];
      if (popup) {
        const r = popup.getBoundingClientRect();
        const popupRegion = {
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top,
        };
        if (holdsPointer(popupRegion, p)) return;
      }
    }

    // Test against the layout as displayed: while a helmet is open the others
    // stand repelled, and each claims its whole resting-to-repelled band, so
    // the pointer can aim at where a helmet is, where it was, or anywhere it
    // fled through.
    change(hitTest(layout, p, reduced ? undefined : openLayout));
  }

  function openSheet(i: number) {
    setSheet(i);
    dialogRef.current?.showModal();
  }

  const sheetProfile = sheet === null ? undefined : profiles[sheet];

  return (
    <>
      <div
        ref={clusterRef}
        className="home-cluster"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => {
          if (wide) change(null);
        }}
        onBlurCapture={(e) => {
          const next = e.relatedTarget;
          if (
            wide &&
            (!(next instanceof Node) || !clusterRef.current?.contains(next))
          ) {
            change(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !wide) return;
          const closing = open;
          change(null);
          if (closing !== null) {
            tileRefs.current[closing]?.focus({ preventScroll: true });
          }
        }}
      >
        {profiles.map((profile, i) => {
          const l = layout[i];
          if (!l) return null;
          const isOpen = open === i;

          let x = l.tx;
          let y = l.ty;
          let rotate = l.deg;
          let scale = 1;
          let opacity = 1;
          if (isOpen) {
            x = reduced ? 0 : openShiftX(popupSideFor(l));
            y = 0;
            rotate = 0;
            scale = reduced ? 1 : 1.06;
          } else if (openLayout) {
            const off = reduced
              ? { x: l.tx, y: l.ty }
              : repelOffset(l, openLayout);
            x = off.x;
            y = off.y;
            scale = reduced ? 1 : 0.88;
            opacity = 0.55;
          }

          const shift = reduced ? 0 : openShiftX(popupSideFor(l));
          const place = popupPlacement(l, shift);
          const side = popupSideFor(l);
          const meta = formatLeaderMeta(profile.pronouns, profile.year);
          const nodeStyle = {
            left: CONTAINER_W / 2 + l.cx - CARD_W / 2,
            top: CONTAINER_H / 2 + l.cy - CARD_H / 2,
            "--tf": `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`,
            "--op": opacity,
          } as CSSProperties;
          const popupStyle = {
            left: place.left,
            top: place.top,
            transform: `translate(${place.x}, ${place.y})`,
            "--to": place.transformOrigin,
          } as CSSProperties;

          return (
            <div key={profile.slug} style={{ display: "contents" }}>
              <div
                className={["home-lnode", isOpen && "open", was.has(i) && "was"]
                  .filter(Boolean)
                  .join(" ")}
                style={nodeStyle}
                onTransitionEnd={(e) => {
                  if (e.target !== e.currentTarget || isOpen) return;
                  setWas((current) => {
                    if (!current.has(i)) return current;
                    const next = new Set(current);
                    next.delete(i);
                    return next;
                  });
                }}
              >
                <LeaderTile
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  profile={profile}
                  aria-expanded={isOpen}
                  aria-controls={`leader-pop-${i}`}
                  onFocus={() => {
                    if (wide) change(i);
                  }}
                  onClick={() => {
                    if (wide) change(i);
                    else openSheet(i);
                  }}
                />
              </div>
              <div
                ref={(el) => {
                  popupRefs.current[i] = el;
                }}
                id={`leader-pop-${i}`}
                className={["home-lpop", isOpen && "on"]
                  .filter(Boolean)
                  .join(" ")}
                data-side={side}
                role="group"
                aria-label={[profile.name, ...profile.titles].join(", ")}
                style={popupStyle}
              >
                <div className="home-lcard card">
                  <p className="home-lpn">{profile.name}</p>
                  {meta && <p className="home-lmeta">{meta}</p>}
                  <LeaderDetails profile={profile} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <dialog
        ref={dialogRef}
        className="home-lsheet"
        aria-labelledby="leader-sheet-name"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target === e.currentTarget ||
            target.classList.contains("home-lscroll")
          ) {
            dialogRef.current?.close();
          }
        }}
      >
        <div className="home-lscroll">
          <div className="home-lcard card">
            {sheetProfile ? (
              <>
                <div className="home-lshead">
                  <Helmet profile={sheetProfile} sizes="50px" />
                  <div>
                    <p className="home-lpn" id="leader-sheet-name">
                      {sheetProfile.name}
                    </p>
                    {formatLeaderMeta(
                      sheetProfile.pronouns,
                      sheetProfile.year,
                    ) && (
                      <p className="home-lmeta">
                        {formatLeaderMeta(
                          sheetProfile.pronouns,
                          sheetProfile.year,
                        )}
                      </p>
                    )}
                    {sheetProfile.titles.map((title) => (
                      <p key={title} className="home-lrole">
                        {title}
                      </p>
                    ))}
                  </div>
                </div>
                <LeaderDetails profile={sheetProfile} />
              </>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
