import { GEORGIA_311_CONTENT } from "./georgia-311-content.js";
import { meeting, type ChangelogIssue, type FeaturedEvent } from "./issues.js";

/** The Georgia 311 campaign, featuring the interest meetings on these October days. */
function georgia311(
  days: string[],
): Omit<ChangelogIssue, "version" | "sendLabel" | "command"> {
  return {
    term: "Fall 2026",
    title: GEORGIA_311_CONTENT.subject,
    preview: GEORGIA_311_CONTENT.preheader,
    tagline: GEORGIA_311_CONTENT.title,
    intro: GEORGIA_311_CONTENT.intro.join(" "),
    featuredLabel: "Join a 30-minute interest meeting",
    featured: days.map((day) => ({
      meeting: meeting(`2026-10-${day}-georgia-311`),
      cta: "View interest meeting",
    })) as [FeaturedEvent, ...FeaturedEvent[]],
    upcoming: [],
    signoff: GEORGIA_311_CONTENT.footer,
    campaign: GEORGIA_311_CONTENT,
  };
}

/** GDGC has its own issue numbering and archive, sharing the email pipeline. */
export const GDGC_ISSUES: ChangelogIssue[] = [
  {
    version: "1",
    sendLabel: "Tue · Oct 6",
    command: "gdgc --date 2026-10-06",
    ...georgia311(["08", "11", "14"]),
  },
  {
    // Outreach after the Oct 8 meeting; listservs forward this one.
    version: "2",
    sendLabel: "Fri · Oct 9",
    command: "gdgc --date 2026-10-09",
    ...georgia311(["11", "14"]),
  },
];

export function gdgcIssueByVersion(
  version: string,
): ChangelogIssue | undefined {
  return GDGC_ISSUES.find((issue) => issue.version === version);
}
