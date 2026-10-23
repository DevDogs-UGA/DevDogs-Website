/**
 * `/partners` copy: the approved sponsorship packet plus `FACTS.md`. Static;
 * nothing here is read from the request. Policy lines (the FAQ answers, the
 * vetting rules, the NDA and FERPA answers, the BSD-3 terms) are the mockup's
 * wording and wait for Sloan's review.
 */
export const EMAIL = "devdogs@uga.edu";

const subject = (s: string) =>
  `mailto:${EMAIL}?subject=${encodeURIComponent(s)}`;

export const MAILTO = {
  partnering: subject("Partnering with DevDogs"),
  custom: subject("Custom partnership package"),
  packet: subject("Partnership packet request"),
  tierAndDates: `${subject("Partnering with DevDogs")}&body=${encodeURIComponent(
    "Tier:\nWednesdays we like:\nOur speaker or yours:",
  )}`,
} as const;

export const STATS = [
  { value: "600+", label: "students in our Discord" },
  { value: "419", label: "members of our GDG on Campus chapter" },
  { value: "~2,000", label: "CS and data science undergrads at UGA" },
  { value: "26–64", label: "students per meeting" },
] as const;

export const WHY = [
  {
    title: "Spot talent early",
    body: "Connect with students while they are actively building, collaborating, and solving problems. See technical ability, communication, and initiative in a more natural setting than a traditional recruiting interaction.",
  },
  {
    title: "Build familiarity",
    body: "Workshops, technical talks, and campus events help students encounter your company through meaningful experiences, so your brand is recognizable when internship and full-time recruiting begins.",
  },
  {
    title: "Be part of the UGA tech community",
    body: "An ongoing presence in the student developer community: events, tabling, workshops, and other touchpoints through the academic year.",
  },
] as const;

export const WEEK = [
  {
    when: "Monday",
    title: "Merge Monday",
    body: "Every Monday, 6–8 PM. Members pick an issue in DogDays or DogPack and open a pull request before they leave, with help from focus leads and officers.",
  },
  {
    when: "Wednesday",
    title: "Workshop Wednesday",
    body: "About every other week in spring (tentative), 6–7 PM in DLW 124. A hackathon-team member leads a workshop. Co-hosted partner workshops take one of these slots.",
  },
  {
    when: "Each term",
    title: "Demo Days and socials",
    body: "Demo Days show what DogDays and DogPack have shipped, and there is a social every month.",
  },
] as const;

export const TIERS = [
  { name: "Byte", price: "$0" },
  { name: "Kilobyte", price: "$400" },
  { name: "Megabyte", price: "$800" },
  { name: "Gigabyte", price: "$1,200" },
] as const;

/** A cell is its text, `chg` when the tier adds it over the one before, `no` when it is absent. */
type Cell = readonly [text: string, flag?: "chg" | "no"];

export const TIER_GROUPS: readonly {
  group: string;
  rows: readonly { label: string; cells: readonly [Cell, Cell, Cell, Cell] }[];
}[] = [
  {
    group: "The event",
    rows: [
      {
        label: "Interactive workshop night",
        cells: [
          ["Your speaker"],
          ["Your speaker or ours", "chg"],
          ["Your speaker or ours"],
          ["Your speaker or ours"],
        ],
      },
      {
        label: "Event food",
        cells: [
          ["Provided by you"],
          ["Funded by your contribution", "chg"],
          ["Funded by your contribution"],
          ["Funded by your contribution"],
        ],
      },
    ],
  },
  {
    group: "Marketing",
    rows: [
      {
        label: "Website listing",
        cells: [
          ["Alongside event"],
          ["Partners page", "chg"],
          ["Partners page"],
          ["Home page", "chg"],
        ],
      },
      {
        label: "Social media promotion",
        cells: [["1 post"], ["1 post"], ["Recurring", "chg"], ["Recurring"]],
      },
      {
        label: "Logo on club apparel",
        cells: [
          ["Not included", "no"],
          ["Not included", "no"],
          ["Not included", "no"],
          ["Included", "chg"],
        ],
      },
    ],
  },
  {
    group: "Campus reach",
    rows: [
      {
        label: "Computer Science listserv",
        cells: [["1 post"], ["1 post"], ["1 post"], ["Recurring", "chg"]],
      },
    ],
  },
];

export const HOW_TO = [
  {
    title: "Pick a tier and a Wednesday",
    body: "Email us the tier you want and one or two Wednesdays. Say whether your speaker or ours leads.",
  },
  {
    title: "We confirm the plan",
    body: "The leadership team confirms the date, the room, the workshop topic and the food.",
  },
  {
    title: "You present, we promote",
    body: "Your workshop fills the 6–7 PM slot. We promote it the way your tier says.",
  },
] as const;

export const PROJECT_STEPS = [
  {
    title: "Send a short brief",
    body: "The problem, who uses it, and who your contact is.",
  },
  {
    title: "We vet it",
    body: "The leadership team checks that it can be open source, holds no sensitive student data, fits one semester, and has a contact for checkpoints.",
  },
  {
    title: "A team builds it",
    body: "If it fits, it joins the next round of team formation.",
  },
] as const;

export const UGA_TRACK = [
  {
    title: "Departments and faculty",
    items: [
      "Co-host a Workshop Wednesday with your course or lab",
      "Refer students to Merge Monday",
      "Guest-teach a topic",
    ],
  },
  {
    title: "Campus tools",
    items: [
      "Propose a tool for students or staff",
      "Same vetting and BSD-3 terms as any project",
    ],
  },
  {
    title: "Student orgs",
    items: [
      "Co-host a workshop or social",
      "Cross-post on Engage and Discord",
      "Book a joint session in DLW 124",
    ],
  },
] as const;

export const FAQ = [
  {
    q: "Who owns the code a project team writes?",
    a: "Every DevDogs project is open source under the BSD 3-Clause license. Students keep copyright, and club projects are public.",
  },
  {
    q: "Can we sponsor a single event?",
    a: "Yes. Each tier covers one co-hosted workshop night. If you want more than one, ask about our custom package.",
  },
  {
    q: "How do you vet projects?",
    a: "The leadership team reads every brief first. A project needs to be able to live in the open, hold no sensitive student data, fit in one semester, and come with a contact who can join checkpoints. If it doesn't fit, we say so and suggest what would.",
  },
  {
    q: "Can we share internal data or sign an NDA?",
    a: "No. Projects are built in the open, so we can't take confidential code or data, and we don't sign NDAs. If your idea depends on either, a workshop night is a better fit.",
  },
  {
    q: "Can we use what the team builds commercially?",
    a: "Yes. The BSD 3-Clause license lets anyone, including you, use, modify and ship the code, with no warranty. Students keep copyright.",
  },
  {
    q: "What about student data and FERPA?",
    a: "We don't take projects that hold sensitive student data, and we don't give partners member lists. Students choose what they share on their own profiles.",
  },
  {
    q: "Is what you build accessible?",
    a: "We build to accessibility basics (keyboard use, contrast, labels) and check them in code review, but a student team isn't an accessibility audit. If your tool needs a formal standard, tell us in the brief.",
  },
  {
    q: "Who hosts a tool after the students graduate?",
    a: "The code stays public and each project ends with a handover note, so your team or the next student team can host it. We don't promise ongoing support.",
  },
  {
    q: "How far ahead should we ask?",
    a: "For a workshop night, at least three weeks before the Wednesday you want. For a project, send the brief before spring project proposals close. That deadline is tentative.",
  },
  {
    q: "Do you work with organizations outside UGA?",
    a: "Yes. Companies and other organizations can co-host a workshop night, recruit, or bring a project. UGA departments and student orgs are welcome too; see the UGA track above.",
  },
] as const;
