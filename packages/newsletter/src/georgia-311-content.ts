import type { CampaignContent } from "./campaign.js";

/** Approved campaign copy; fill the Google Form URL before sending. */
export const GEORGIA_311_CONTENT: CampaignContent = {
  subject: "UGA students: build for Mableton in the Georgia 311 Challenge",
  preheader:
    "All majors welcome. Join a 30-minute interest meeting and apply by October 15.",
  chapter: "GDG on Campus University of Georgia",
  series: "GDGC Newsletter",
  eyebrow: "GEORGIA 311 CHALLENGE 2026",
  title: "Bring your ideas to Mableton.",
  intro: [
    "How could a city make its services easier to find, its decisions easier to understand, or its staff more effective?",
    "GDG on Campus UGA (DevDogs) is forming student teams for the Georgia 311 Challenge, a prototype challenge focused on Mableton. All majors are welcome. Bring a civic idea, coding skills, or both. Apply individually or with a group.",
  ],
  sections: [
    {
      heading: "Choose a problem that matters",
      items: [
        {
          title: "Transparency & Trust",
          text: "Make city decisions, budgets, and public documents easier to understand.",
        },
        {
          title: "Reach Every Resident",
          text: "Help people navigate city services across languages, ages, and abilities.",
        },
        {
          title: "Tiny Desk, Civic Style",
          text: "Build tools that help a small city staff handle requests and understand public feedback.",
        },
      ],
    },
    {
      heading: "Choose your track. Then apply.",
      paragraphs: [
        "Bring a solution proposal: choose a track and submit a brief project solution proposal. Name the resident group and need, describe your proposed solution, and explain how it would help. Builders and designers: apply with your skills and interests. You can apply individually or with a group, as someone bringing a solution proposal, a builder or designer, or both.",
        "Team mentors and Wednesday build sessions help you turn the idea into a prototype. Teams submit a working prototype, a two-page brief, a 3\u20135 minute demo, and a path to adoption. Projects must use at least one Google technology, rely on public data, and operate within free tiers.",
      ],
    },
    {
      heading: "A three-week sprint \u00b7 October 16\u201330",
      paragraphs: [
        "From team and stack placements on Friday, October 16 to the presentation on Friday, October 30, build across three calendar weeks with team mentors and Wednesday build sessions.",
      ],
      items: [
        {
          title: "Week 1 \u00b7 Place & prototype",
          text: "Oct 16: team and stack placements. Oct 21: deployed prototype.",
        },
        {
          title: "Week 2 \u00b7 Refine & rehearse",
          text: "Oct 25: brief draft. Oct 28: scored dry run and recorded backup demo.",
        },
        {
          title: "Week 3 \u00b7 Present",
          text: "Oct 30: presentation; final event logistics pending.",
        },
      ],
    },
  ],
  cta: {
    heading: "Apply by October 15",
    label: "Apply with the Google Form",
    url: "https://devdogsuga.org/georgia311",
    paragraphs: [
      "Top teams present to Mableton city officials at DevFest Atlanta, with travel expenses covered.",
    ],
  },
  footer:
    "Questions? Contact DevDogs at devdogs@uga.edu or visit devdogsuga.org.",
  promo: {
    heading: "Keep building with DevDogs",
    text: "GDG on Campus UGA (DevDogs) brings students together for workshops, Wednesday build sessions and shared projects. Meet teammates, learn new skills and stay involved beyond Georgia 311.",
    url: "https://devdogsuga.org",
    label: "Explore DevDogs",
  },
};
