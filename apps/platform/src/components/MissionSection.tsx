import Image from "next/image";
import backendDiscussion from "~/assets/BackendDiscussion.jpg";
import { Card } from "~/ui/card";
import type { EventCategory } from "~/lib/eventKind";
import { MISSION_PARAGRAPHS } from "~/components/homeCopy";

/**
 * What a semester holds, one card per meeting category in its own hue. The copy
 * is the weekly rhythm in `FACTS.md` (Merge Monday every week; workshops, Demo
 * Days and a monthly social around it).
 */
const WEEK: readonly {
  kind: EventCategory;
  sprite: string;
  title: string;
  body: string;
}[] = [
  {
    kind: "build",
    sprite: "laptop",
    title: "Merge Monday",
    body: "Every Monday, 6 to 8 PM. Pick an issue, open a pull request, and get help from focus leads.",
  },
  {
    kind: "workshop",
    sprite: "light_bulb",
    title: "Workshops",
    body: "Next.js, Flutter, Supabase and Git, taught by members. Some Mondays this fall, Wednesdays in spring.",
  },
  {
    kind: "milestone",
    sprite: "trophy",
    title: "Demo Days",
    body: "Show what we’ve built so far. Nov 16 this fall, and two in spring.",
  },
  {
    kind: "social",
    sprite: "tennis",
    title: "Socials",
    body: "Once a month. Touch grass with the people you build with.",
  },
];

const [LEAD, ...REST] = MISSION_PARAGRAPHS;

/** Mission copy and photo, then what a semester holds. A plain section; the Projects band follows. */
export default function MissionSection() {
  return (
    <section id="mission" className="section scroll-mt-20">
      <div className="wrap home-mission">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Mission
          </div>
          <h2 style={{ marginBottom: 22 }}>Learn by doing.</h2>
          <p className="lead">{LEAD}</p>
          {REST.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="home-mission-wrap">
          <Card className="k home-photo">
            <Image
              src={backendDiscussion}
              alt="DevDogs team planning session"
              sizes="(min-width: 1200px) 520px, (min-width: 901px) 45vw, calc(100vw - 80px)"
            />
          </Card>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-rider"
            src="/cosmic/a/sprite/glasses.png"
            alt=""
          />
        </div>
      </div>
      <div className="wrap">
        <div className="g4 home-does grid">
          {WEEK.map(({ kind, sprite, title, body }) => (
            <Card key={title} data-kind={kind} className="quiet">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="sprite"
                src={`/cosmic/a/sprite/${sprite}.png`}
                alt=""
              />
              <h3>{title}</h3>
              <p>{body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
