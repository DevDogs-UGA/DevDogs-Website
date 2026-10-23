"use client";

import dynamic from "next/dynamic";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { buttonVariants } from "~/ui/button";
import { VIEW, type BuildingKey } from "./campusMapMeta";
import { BUILDING_NAME, mapUrls } from "./buildings";

/**
 * The map is the heavy part of the dialog, 46 KB of OSM paths, so it is a
 * chunk of its own, fetched when the dialog first renders. `preloadCampusMap`
 * shares the same `import()`, which the bundler resolves to the same chunk, so
 * a trigger can start that fetch the moment someone shows intent and the map
 * is usually already here by the time the dialog opens.
 */
const CampusMap = dynamic(() => import("./CampusMap"), {
  loading: () => <MapPlaceholder />,
});
export function preloadCampusMap() {
  void import("./CampusMap");
}

interface Props {
  /** The building to draw. Defaults to the club's usual one. */
  building?: BuildingKey;
  /** The room inside it, as an officer typed it. */
  room?: string | null;
}

/**
 * Everything inside the drawer below its title: the campus map with the
 * building highlighted, a line about where it is, and the hand-off to a
 * navigation app for the door-to-door part.
 *
 * There used to be a second tab here, a floor plan of the walk to DLW 124
 * (`FloorPlan.tsx`, still on disk with its `ROOM_STEPS`). It is parked rather
 * than deleted: the drawing was hand-traced, and it comes back once there is a
 * real plan of the building to draw from.
 */
export default function FindUsContent({
  building = "DLW",
  room = "124",
}: Props = {}) {
  const urls = mapUrls(building);
  const linkClass = buttonVariants({ variant: "secondary", size: "sm" });

  return (
    // A flex column rather than bare children of a grid body: the map is an
    // SVG sized by `width: 100%` and its viewBox, and as a direct grid item
    // Chrome resolves its row to zero height and lets it paint over whatever
    // follows. A flex column measures it properly.
    <div className="flex flex-col gap-4">
      <CampusMap building={building} tone="dark" />

      {building === "DLW" ? (
        <p className="small muted m-0">
          The DLW sits at the corner of E. Cloverhurst Ave and University Court
          — just below the Hill dorms, across from O-House, and downhill from
          the Tate Center. Driving? The Tate Deck is the closest visitor
          parking, about a five-minute walk away.
        </p>
      ) : (
        /* One sentence rather than the DLW's paragraph of landmarks. Writing
           nine more of those is writing nine more things that can go stale,
           and the map above already says where it is. */
        <p className="small muted m-0">
          {room === null
            ? `This meeting is in ${BUILDING_NAME[building]}, highlighted above.`
            : `This meeting is in ${room}, ${BUILDING_NAME[building]} — highlighted above.`}
        </p>
      )}

      {/* No turn-by-turn here: people start from all over campus, so the map
          places the building and these hand off to a navigation app. */}
      <div className="flex flex-wrap gap-2">
        <DirectionsLink href={urls.google} className={linkClass}>
          Google Maps
        </DirectionsLink>
        <DirectionsLink href={urls.apple} className={linkClass}>
          Apple Maps
        </DirectionsLink>
      </div>
    </div>
  );
}

/**
 * Holds the map's exact footprint while its chunk is in flight, so the drawer
 * opens at its final height and nothing below the map jumps when it lands.
 */
export function MapPlaceholder() {
  return (
    <div
      aria-hidden
      style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
      className="skel w-full"
    />
  );
}

/** The map's silhouette, for the moment before the drawer's content arrives. */
export function FindUsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <MapPlaceholder />
    </div>
  );
}

function DirectionsLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children} <ArrowUpRightIcon weight="bold" aria-hidden />
    </a>
  );
}
