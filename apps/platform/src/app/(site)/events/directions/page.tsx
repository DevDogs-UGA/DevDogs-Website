import type { Metadata } from "next";
import EventsBody from "~/components/EventsSection/EventsBody";
import { DirectionsRoute } from "~/components/EventsSection/FindUs";
import FindUsContent from "~/components/EventsSection/FindUs/FindUsContent";
import { findUsBlurb } from "~/components/EventsSection/FindUs/copy";
import { directionsTarget } from "~/components/EventsSection/FindUs/buildings";

/**
 * Its own metadata because this URL gets handed around, pasted into Discord or
 * printed as a QR code, and an unfurl titled "DevDogs" says nothing about where
 * the meeting is.
 *
 * The description is built from the DLW rather than the request's own `?b=`,
 * because this export cannot see the search params and the club's usual room is
 * the right answer for a bare link. A crawler that follows `?b=Driftmier` gets
 * a slightly generous unfurl. A member who clicks it gets the right map, which
 * is the half that matters.
 */
export const metadata: Metadata = {
  title: "Directions | DevDogs",
  description: findUsBlurb("DLW", "124"),
};

/**
 * Directions are a drawer, not a page (D1): this URL renders the events page
 * with the drawer open over it. The schedule is the same cached read `/events`
 * uses; only the drawer depends on the request.
 *
 * The building rides in the query string rather than a route segment, so one
 * page serves all ten and the link a meeting hands out stays pasteable. See
 * `directionsTarget` for how a partial or unrecognised link resolves.
 */
export default async function DirectionsPage({
  searchParams,
}: PageProps<"/events/directions">) {
  const { b, r } = await searchParams;
  const { building, room } = directionsTarget(b, r);

  return (
    <>
      <EventsBody />
      <DirectionsRoute building={building} room={room}>
        <FindUsContent building={building} room={room} />
      </DirectionsRoute>
    </>
  );
}
