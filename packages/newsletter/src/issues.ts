/**
 * The Changelog's content: the dated sends themselves, listing events read
 * from the club config in `@devdogsuga/events`.
 *
 * Issues are versioned with semver — a send is a release. Issue copy lives
 * here rather than in the components so a copy pass before a send touches one
 * file, and so the platform's archive pages and the exported emails can never
 * disagree about what an issue said.
 */
import { getClubConfig, type Meeting } from "@devdogsuga/events";

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
  featured: Meeting;
  /** The hero card's button label. */
  cta: string;
  upcoming: Meeting[];
  signoff: string;
}

const MEETINGS = new Map(getClubConfig().meetings.map((m) => [m.slug, m]));

/** A meeting from the club config, by slug. Throws on a typo rather than
 * rendering an issue with a hole in it. */
function meeting(slug: string): Meeting {
  const found = MEETINGS.get(slug);
  if (found === undefined) {
    throw new Error(`No meeting "${slug}" in the club config.`);
  }
  return found;
}

/** Every event an issue lists, by its slug in the club config. */
const EVENTS = {
  coldstart: meeting("2026-09-14"),
  build1: meeting("2026-09-16"),
  nextflutter: meeting("2026-09-21"),
  build2: meeting("2026-09-23"),
  supabase: meeting("2026-09-28"),
  build3: meeting("2026-09-30"),
  judging1: meeting("2026-10-05-judging"),
  career: meeting("2026-10-05-workshop"),
  touchgrass1: meeting("2026-10-07"),
  nextflutter2: meeting("2026-10-12"),
  build4: meeting("2026-10-14"),
};

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
      "Tonight at 6: the Supabase workshop, then our first feature competition of the year kicks off.",
    tagline: "Your app gets a backend tonight.",
    intro:
      "Tonight's workshop adds Supabase to the app you started at the Next.js and Flutter workshops: sign-in, a Postgres database, and row-level security. Web and mobile tracks share one project. Then our first feature competition of the year kicks off: form a team of 2 to 4 and build a feature for the club's own platform. Entries close at 6 PM next Monday, when teams present their work.",
    featuredLabel: "happening_tonight",
    featured: EVENTS.supabase,
    cta: "See the schedule",
    upcoming: [
      EVENTS.build3,
      EVENTS.judging1,
      EVENTS.career,
      EVENTS.touchgrass1,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Turn on GitHub two-factor before you come: you need it to join a team.",
  },
  {
    version: "3.0.3",
    term: "Fall 2026",
    sendLabel: "Mon · Oct 5",
    command: "changelog --date 2026-10-05",
    title: "Demo Night Is Tonight (DevDogs Changelog v3.0.3)",
    preview:
      "Tonight at 6: teams present their feature competition entries, then Career Fair Readiness at 7.",
    tagline: "Time to demo.",
    intro:
      "Entries for our first feature competition close at 6 PM tonight, and every team gets the floor to show what they built for the club's platform. Officers score each entry and the room votes, so come cheer on your friends even if you didn't compete. At 7 we move to DLW 110 for Career Fair Readiness: resume polish, portfolio pointers, and practice talking about what you've built.",
    featuredLabel: "happening_tonight",
    featured: EVENTS.judging1,
    cta: "See the schedule",
    upcoming: [
      EVENTS.career,
      EVENTS.touchgrass1,
      EVENTS.nextflutter2,
      EVENTS.build4,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Bring your demo, or just bring a vote.",
  },
];

export function issueByVersion(version: string): ChangelogIssue | undefined {
  return ISSUES.find((issue) => issue.version === version);
}
