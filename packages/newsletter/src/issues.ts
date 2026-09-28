/**
 * The Changelog's content: the dated sends themselves, listing events read
 * from the club config in `@devdogsuga/events` (see `./events.ts`).
 *
 * Issues are versioned with semver — a send is a release. Issue copy lives
 * here rather than in the components so a copy pass before a send touches one
 * file, and so the platform's archive pages and the exported emails can never
 * disagree about what an issue said.
 */
import { configEvent } from "./events.js";

export interface ChangelogEvent {
  /** The chip label — the calendar's event-type vocabulary. */
  chip: string;
  /** The event-type accent from `KIND`. */
  color: string;
  title: string;
  /** Three-letter weekday, uppercase. */
  dow: string;
  /** `"Sep 9"` — month then day, split for the stacked date column. */
  date: string;
  time: string;
  loc: string;
  rsvp: string | null;
  blurb: string;
}

export interface ChangelogIssue {
  /** Semver, doubling as the URL segment and the export filename. */
  version: string;
  term: string;
  /** The title-bar date, `"Wed · Sep 9"`. */
  sendLabel: string;
  /** The prompt line, `"changelog --date 2026-09-09"`. */
  command: string;
  /** The email subject line. */
  title: string;
  /** Inbox preview text, hidden in the body. */
  preview: string;
  tagline: string;
  intro: string;
  /** The `##` heading over the hero card, e.g. `"happening_today"`. */
  featuredLabel: string;
  featured: ChangelogEvent;
  /** The hero card's button label. */
  cta: string;
  upcoming: ChangelogEvent[];
  signoff: string;
}

/**
 * Every event an issue lists, by its id in the club config. Dates, rooms,
 * titles, RSVP links and copy come from there; an override here is only for
 * what the config has no field for.
 */
const EVENTS = {
  coldstart: configEvent("rectaW4iGmfDA3uwQ", {
    // The calendar has no kind for the year's first night.
    chip: "Kickoff",
    // The config's summary predates the workshop being on the agenda.
    blurb:
      "The inaugural meeting for the 2026–2027 year. Get set up to contribute to this year's projects. Plus, a collaborative coding workshop: an introduction to Git, GitHub, and how to contribute to a team project.",
  }),
  build1: configEvent("rec1BrdXl7u8bYGXH"),
  nextflutter: configEvent("recBF3KxHMKsT4Mz8"),
  build2: configEvent("recGqvQqUDFlrXPRc"),
  supabase: configEvent("recqDUR1D3CQNBVe5"),
  build3: configEvent("rec6aLjA2ZhT45xuh"),
  career: configEvent("recljv0crLDtLIBPc"),
  touchgrass1: configEvent("touch-grass-1-2026"),
} satisfies Record<string, ChangelogEvent>;

export const ISSUES: ChangelogIssue[] = [
  {
    version: "3.0.0",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 14",
    command: "changelog --date 2026-09-14",
    title: "DevDogs Changelog v3.0.0: Get Started Tonight!",
    preview:
      "Tonight at 6: Cold Start. Get set up to build with us this semester.",
    tagline: "Let's boot up!",
    intro:
      "Missed the interest meeting? No problem. Cold Start is the inaugural meeting of the year. Get set up to contribute to this semester's projects, with onboarding we've streamlined so you leave ready to build.",
    featuredLabel: "happening_tonight",
    featured: EVENTS.coldstart,
    cta: "RSVP for Cold Start",
    upcoming: [
      EVENTS.build1,
      EVENTS.nextflutter,
      EVENTS.build2,
      EVENTS.supabase,
      EVENTS.build3,
      EVENTS.career,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Bring a laptop if you have one, and we'll get you set up to ship either way.",
  },
  {
    version: "3.0.1",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 14",
    command: "changelog --date 2026-09-21",
    title: "Workshops You Won't Want to Miss (DevDogs Changelog v3.0.1)",
    preview:
      "Tonight at 6: Next.js and Flutter Workshops. Get started on your web or mobile application development journey.",
    tagline: "Feature competition #1 kicks off tonight!",
    intro:
      "But first, they're saying it's the most important workshops of the semester: Flutter and Next.js, the frameworks underpinning this year's projects. Then, we'll be kicking off our first feature competition!",
    featuredLabel: "happening_tonight",
    featured: EVENTS.nextflutter,
    cta: "RSVP for Cold Start",
    upcoming: [EVENTS.build2, EVENTS.supabase, EVENTS.build3, EVENTS.career],
    signoff:
      "Doors tonight at 6 in DLW 124. Bring a laptop if you have one, but we'll get you set up to ship either way.",
  },
  {
    version: "3.0.2",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 28",
    command: "changelog --date 2026-09-28",
    title: "Give Your App a Backend Tonight (DevDogs Changelog v3.0.2)",
    preview:
      "Tonight at 6: the Supabase workshop, plus this week's feature competition. Auth, a database, and your first real data.",
    tagline: "Your app gets a backend tonight.",
    intro:
      "Tonight's workshop adds Supabase to the app you started at the Next.js and Flutter workshops: sign-in, a Postgres database, and row-level security. Web and mobile tracks share one project. After the demo we kick off this week's feature competition. Teams are 2 to 4, and entries close when next Monday's meeting starts.",
    featuredLabel: "happening_tonight",
    featured: EVENTS.supabase,
    cta: "See the schedule",
    upcoming: [EVENTS.build3, EVENTS.career, EVENTS.touchgrass1],
    signoff:
      "Doors tonight at 6 in DLW 124. Turn on GitHub two-factor before you come: you need it to join a team.",
  },
];

export function issueByVersion(version: string): ChangelogIssue | undefined {
  return ISSUES.find((issue) => issue.version === version);
}
