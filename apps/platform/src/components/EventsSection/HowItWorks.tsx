"use client";

import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { Band } from "~/ui/band";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import Badge from "~/ui/badge";
import type { EventCategory } from "~/lib/eventKind";
import { useTvStatic } from "./useTvStatic";

/**
 * Weekly Programming: the club's week, drawn as a strip and a pixel television.
 *
 * The strip is eight columns, Monday to the next Monday, with a dot where the
 * club meets and a barber-pole bar for the review that runs all week. The four
 * day cards sit on those columns, above and below it, each with a pointer at its
 * dot. Hovering or focusing a card lights its part of the strip, turns the
 * set's knobs, colours its lamp and changes the channel to that card's GIF;
 * static plays whenever no card is live (see `useTvStatic`). Under 720px the
 * strip and pointers are hidden and the cards stack.
 *
 * Copy is the Merge Monday plan in `FACTS.md`; spring is tentative and says so.
 */

type Strip = "monday" | "wednesday" | "week" | "nextMonday";

interface Beat {
  strip: Strip;
  kind: EventCategory;
  day: string;
  title: string;
  body: string;
  chips?: { label: string; kind: EventCategory; tentative?: boolean }[];
  gif: string;
  side: "above" | "below";
  col: 1 | 3 | 5 | 7;
  caret?: "start" | "end";
}

const BEATS: readonly Beat[] = [
  {
    strip: "monday",
    kind: "build",
    day: "Monday, 6 to 8 PM",
    title: "Merge Monday",
    body: "Pick an issue in one of our projects and open a pull request before you leave. An unfinished one counts. Focus leads pair with newcomers. This fall, some Mondays open with a workshop.",
    chips: [{ label: "Build", kind: "build" }],
    gif: "information",
    side: "above",
    col: 1,
    caret: "start",
  },
  {
    strip: "wednesday",
    kind: "workshop",
    day: "Wednesday, 6 to 7 PM",
    title: "Workshop Wednesday",
    body: "In spring, workshops move to about every other Wednesday and a hackathon-team member hosts. Mondays stay pure Merge Monday.",
    chips: [{ label: "Workshop", kind: "workshop", tentative: true }],
    gif: "bruce-almighty",
    side: "below",
    col: 3,
    caret: "start",
  },
  {
    strip: "week",
    kind: "info",
    day: "All week",
    title: "Review and merge",
    body: "Focus leads review your pull request during the week. Get it merged and you earn EL credit and a check-in star.",
    gif: "muybridge-horse",
    side: "above",
    col: 5,
  },
  {
    strip: "nextMonday",
    kind: "build",
    day: "Next Monday",
    title: "Merge Monday again",
    body: "It runs every week, in the same room. Pick up your open pull request or take a new issue.",
    gif: "charlie-conspiracy",
    side: "below",
    col: 7,
    caret: "end",
  },
];

const MORE: readonly {
  kind: EventCategory;
  label: string;
  title: string;
  body: string;
}[] = [
  {
    kind: "milestone",
    label: "Demo Days",
    title: "Show what we’ve built",
    body: "One this fall. In spring, a mid-semester Demo Day and a final one, both tentative.",
  },
  {
    kind: "social",
    label: "Socials",
    title: "Once a month",
    body: "A social each month, with the final one alongside the last Demo Day. Spring is tentative.",
  },
  {
    kind: "info",
    label: "Credit",
    title: "EL credit and a check-in star",
    body: "Attend a workshop, or contribute a feature to one of our projects. Most contributions start at Merge Monday.",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"] as const;
/** Which day columns light up for each card. */
const COLS: Record<Strip, readonly number[]> = {
  monday: [0],
  wednesday: [2],
  week: [3, 4, 5, 6],
  nextMonday: [7],
};
const LAMP: Record<Strip, string> = {
  monday: "#0ea5e9",
  wednesday: "#10b981",
  week: "#eab308",
  nextMonday: "#0ea5e9",
};
/** Pointer frames on the knob sheet: 0 is up, clockwise, 45 degrees each. */
const KNOB: Record<Strip, readonly [number, number]> = {
  monday: [7, 6],
  wednesday: [1, 7],
  week: [3, 1],
  nextMonday: [5, 3],
};

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const knobPosition = (frame: number): CSSProperties => ({
  backgroundPosition: `${(frame * 100) / 7}% 0`,
});

export default function HowItWorks({ id = "how-it-works" }: { id?: string }) {
  const [active, setActive] = useState<Strip | null>(null);
  const staticRef = useTvStatic();
  // GIFs cannot be paused, so a visitor who wants less motion keeps the frozen
  // snow on the set instead of a channel.
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );
  const gif = BEATS.find((beat) => beat.strip === active)?.gif;
  const knobs = active ? KNOB[active] : ([0, 0] as const);

  return (
    <Band id={id} className="section" aria-labelledby={`${id}-heading`}>
      <div className="wrap">
        <div className="home-wp-top">
          <div className="home-wp-copy">
            <h2 id={`${id}-heading`}>Weekly Programming</h2>
            <p className="muted">
              Merge Monday every week. Workshops, Demo Days and a monthly social
              round out the semester.
            </p>
          </div>
          <div className="home-tv" aria-hidden="true">
            <div className="screen">
              <canvas ref={staticRef} width={96} height={72} />
              {gif && !reduced ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={gif} src={`/cosmic/a/tv/${gif}.gif`} alt="" />
              ) : null}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tv-set" src="/cosmic/a/tv/tv.png" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="glass" src="/cosmic/a/tv/glass.png" alt="" />
            <i className="knob a" style={knobPosition(knobs[0])} />
            <i className="knob b" style={knobPosition(knobs[1])} />
            <i
              className="lamp"
              style={{ background: active ? LAMP[active] : "#78716c" }}
            />
          </div>
        </div>

        <div
          className="home-wp-grid"
          data-hovering={active !== null ? "true" : "false"}
        >
          <div
            className="home-wp-strip"
            role="figure"
            aria-label="A week of the club: Merge Monday on Monday, a Workshop Wednesday on some Wednesdays in spring, pull request review all week, and Merge Monday again the next Monday."
          >
            <div className="home-wp-days">
              {DAYS.map((name, i) => (
                <span
                  key={i}
                  className={i === 0 || i === 7 ? "meet" : undefined}
                  data-active={
                    active !== null && COLS[active].includes(i)
                      ? "true"
                      : "false"
                  }
                >
                  {name}
                </span>
              ))}
            </div>
            <div className="home-wp-track">
              <span className="home-wp-bar tail l" aria-hidden="true" />
              <span
                className="home-wp-bar wk"
                aria-hidden="true"
                data-active={active === "week" ? "true" : "false"}
              />
              <span className="home-wp-bar tail r" aria-hidden="true" />
              <Dot strip="monday" col={1} color="#0ea5e9" active={active}>
                Monday: Merge Monday
              </Dot>
              <Dot strip="wednesday" col={3} color="#10b981" active={active}>
                Wednesday: workshop night
              </Dot>
              <Dot strip="nextMonday" col={8} color="#0ea5e9" active={active}>
                Next Monday: Merge Monday again
              </Dot>
            </div>
          </div>

          <ol className="home-wp-beats">
            {BEATS.map((beat) => (
              <Card
                key={beat.strip}
                as="li"
                kind={beat.kind}
                interactive
                className="home-wp-beat"
                data-active={active === beat.strip ? "true" : "false"}
                data-side={beat.side}
                data-col={beat.col}
                data-caret={beat.caret}
                onMouseEnter={() => setActive(beat.strip)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(beat.strip)}
                onBlur={() => setActive(null)}
              >
                <span className="home-wp-caret" aria-hidden="true" />
                <p className="home-wp-day">{beat.day}</p>
                <h3>{beat.title}</h3>
                {beat.chips ? (
                  <div className="chips">
                    {beat.chips.map((chip) => (
                      <span key={chip.label} style={{ display: "contents" }}>
                        <Chip kind={chip.kind}>{chip.label}</Chip>
                        {chip.tentative ? (
                          <Badge variant="info">Tentative</Badge>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="body">{beat.body}</p>
              </Card>
            ))}
          </ol>
        </div>

        <div className="g3 home-wp-more grid">
          {MORE.map((card) => (
            <Card key={card.label} data-kind={card.kind} className="quiet">
              <p className="home-wp-day">{card.label}</p>
              <h3>{card.title}</h3>
              <p className="body">{card.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </Band>
  );
}

function Dot({
  strip,
  col,
  color,
  active,
  children,
}: {
  strip: Strip;
  col: number;
  color: string;
  active: Strip | null;
  children: string;
}) {
  return (
    <span
      className="home-wp-cell"
      style={{ gridColumn: col }}
      data-active={active === strip ? "true" : "false"}
    >
      <i
        className="home-wp-dot"
        style={{ "--d": color } as CSSProperties}
        role="img"
        aria-label={children}
      />
    </span>
  );
}
