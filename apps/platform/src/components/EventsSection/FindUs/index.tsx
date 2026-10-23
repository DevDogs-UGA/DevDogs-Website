"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MapTrifoldIcon } from "@phosphor-icons/react/ssr";
import FindUsDrawer from "./FindUsDrawer";
import FindUsContent, { preloadCampusMap } from "./FindUsContent";
import type { BuildingKey } from "./campusMapMeta";

/**
 * Every way of showing intent short of clicking. A pointer arriving, a keyboard
 * focus, a finger landing. Each starts the map chunk downloading so it is
 * normally already here when the drawer opens. Calling it twice is free.
 */
const INTENT_HANDLERS = {
  onPointerEnter: preloadCampusMap,
  onFocus: preloadCampusMap,
  onTouchStart: preloadCampusMap,
};

/** A button that opens the directions drawer in place. */
export default function FindUs({
  building = "DLW",
  room = "124",
}: {
  building?: BuildingKey;
  room?: string | null;
} = {}) {
  return (
    <FindUsDrawer
      building={building}
      room={room}
      trigger={
        <button type="button" className="btn secondary" {...INTENT_HANDLERS}>
          <MapTrifoldIcon weight="bold" aria-hidden /> Directions
        </button>
      }
    >
      <FindUsContent building={building} room={room} />
    </FindUsDrawer>
  );
}

/**
 * The drawer reached through a URL: `/events/directions` renders the events
 * page and this, open. Closing it goes to `/events`, which is the page already
 * behind it, so the reader sees the drawer slide away rather than a navigation.
 */
export function DirectionsRoute({
  building = "DLW",
  room = "124",
  children,
}: {
  building?: BuildingKey;
  room?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <FindUsDrawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace("/events", { scroll: false });
      }}
      building={building}
      room={room}
    >
      {children}
    </FindUsDrawer>
  );
}
