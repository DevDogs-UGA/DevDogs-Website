import { GEORGIA_311_CONTENT } from "./georgia-311-content.js";
import { meeting, type ChangelogIssue, type FeaturedEvent } from "./issues.js";

/** GDGC has its own issue numbering and archive, sharing the email pipeline. */
export const GDGC_ISSUES: ChangelogIssue[] = [
  {
    version: "1",
    term: "Fall 2026",
    sendLabel: "Tue · Oct 6",
    command: "gdgc --date 2026-10-06",
    title: GEORGIA_311_CONTENT.subject,
    preview: GEORGIA_311_CONTENT.preheader,
    tagline: GEORGIA_311_CONTENT.title,
    intro: GEORGIA_311_CONTENT.intro.join(" "),
    featuredLabel: "Join a 30-minute interest meeting",
    featured: ["08", "11", "14"].map((day) => ({
      meeting: meeting(`2026-10-${day}-georgia-311`),
      cta: "View interest meeting",
    })) as [FeaturedEvent, ...FeaturedEvent[]],
    upcoming: [],
    signoff: GEORGIA_311_CONTENT.footer,
    campaign: GEORGIA_311_CONTENT,
  },
];

export function gdgcIssueByVersion(
  version: string,
): ChangelogIssue | undefined {
  return GDGC_ISSUES.find((issue) => issue.version === version);
}
