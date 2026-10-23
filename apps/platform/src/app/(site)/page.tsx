import { Suspense, type ReactNode } from "react";
import HeroSection from "~/components/HeroSection";
import MissionSection from "~/components/MissionSection";
import ProjectsSection from "~/components/ProjectsSection";
import EventsSection from "~/components/EventsSection";
import HowItWorks from "~/components/EventsSection/HowItWorks";
import UpcomingMeetings, {
  NextMeeting,
} from "~/components/EventsSection/UpcomingMeetings";
import PartnersSection from "~/components/PartnersSection";
import LeadershipSection from "~/components/LeadershipSection";
import JsonLd, { siteGraph } from "~/lib/structuredData";
import "~/components/Home/home.css";

/**
 * Cached for a minute, then re-rendered in the background. Everything
 * here is static copy except the meetings (the lead card and the list), and a
 * minute is as stale as "next meeting" should get when one ends.
 */
export const revalidate = 60;

export default function HomePage() {
  return (
    <>
      {/* The Organization and WebSite nodes, on the homepage and nowhere else.
          Both describe the site rather than this page, so repeating them on
          every route would be the same two claims made 28 times over, and a
          crawler that finds several copies of a node has to pick one. The apex
          is where a search engine looks for them.

          It sits out here rather than inside {@link HomeSections} because it
          describes the site rather than the cached page sections themselves. */}
      <JsonLd data={siteGraph()} />
      <HomeSections
        nextMeeting={
          <Suspense>
            <NextMeeting />
          </Suspense>
        }
        upcomingMeetings={
          <Suspense>
            <UpcomingMeetings />
          </Suspense>
        }
      />
    </>
  );
}

/**
 * `"use cache"` is what puts the homepage in the prerendered shell. Under Cache
 * Components everything is dynamic by default, so without it the static output
 * was the nav chrome and nothing else, and every visit re-rendered the whole
 * marketing page on the server. Every section here is static copy or reads a
 * cached loader, so caching is accurate -- except the meetings, which are
 * neither: they need "now", not whatever was true when this cache entry was
 * last populated. Those elements arrive as props, built by `HomePage` above
 * before this function is entered, so they render on the request that's
 * actually being served instead of getting frozen into the shared cache entry
 * (or, worse, having their database read attributed to the wrong request
 * entirely -- see `UpcomingMeetings`'s doc comment for what that looked like).
 *
 * The sections alternate: a plain section, then a `Band`, and never two of the
 * same kind in a row. The page's `<main>` is the site layout's.
 */
async function HomeSections({
  nextMeeting,
  upcomingMeetings,
}: {
  nextMeeting: ReactNode;
  upcomingMeetings: ReactNode;
}) {
  "use cache";

  return (
    <div className="home">
      <HeroSection />
      {nextMeeting}
      <MissionSection />
      <ProjectsSection />
      <EventsSection upcomingMeetings={upcomingMeetings} />
      <HowItWorks />
      <PartnersSection />
      <LeadershipSection />
    </div>
  );
}
