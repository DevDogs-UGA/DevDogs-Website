import {
  GDGC_ISSUES,
  gdgcIssueByVersion,
  type ChangelogIssue,
} from "@devdogsuga/newsletter";
import type { Block } from "../blocks";
import { NOT_FOUND, page, PUBLIC, terminal } from "../define";
import { ACCENT, TONE } from "../theme";
import { featureCard, features, issueEventItem } from "./changelog";

/**
 * /newsletters/gdgc and /newsletters/gdgc/:version: the GDGC newsletter, from
 * the same `GDGC_ISSUES` the archive pages and the sent emails render. An
 * issue with `campaign` copy follows `CampaignEmail`'s order (intro, the
 * featured meetings, each section, the call to action, the promo); one
 * without falls back to the Changelog's shape.
 */

function campaignBody(issue: ChangelogIssue): Block[] {
  const campaign = issue.campaign!;
  const featured = features(issue);
  const body: Block[] = [
    { type: "lead", text: campaign.title },
    ...campaign.intro.map((text): Block => ({ type: "text", text })),
  ];
  if (featured.length > 0) {
    body.push(
      {
        type: "heading",
        text: issue.featuredLabel,
        color: issueEventItem(featured[0]!.meeting).chip.color,
      },
      ...featured.map((feature): Block => ({
        type: "card",
        card: featureCard(feature),
      })),
    );
  }
  for (const section of campaign.sections) {
    body.push(
      { type: "heading", text: section.heading, color: TONE.ink },
      ...(section.paragraphs ?? []).map((text): Block => ({
        type: "text",
        text,
      })),
    );
    if (section.items?.length) {
      body.push({
        type: "entries",
        items: section.items.map((item) => ({
          label: item.title,
          text: item.text,
        })),
        empty: "",
      });
    }
  }
  body.push(
    { type: "heading", text: campaign.cta.heading, color: ACCENT.amber },
    ...campaign.cta.paragraphs.map((text): Block => ({ type: "text", text })),
    {
      type: "links",
      items: [{ label: campaign.cta.label, url: campaign.cta.url }],
    },
    { type: "heading", text: campaign.promo.heading, color: ACCENT.sky },
    { type: "text", text: campaign.promo.text },
    {
      type: "links",
      items: [{ label: campaign.promo.label, url: campaign.promo.url }],
    },
    { type: "text", text: campaign.footer, tone: "mute" },
  );
  return body;
}

function plainBody(issue: ChangelogIssue): Block[] {
  return [
    { type: "lead", text: issue.tagline },
    { type: "text", text: issue.intro },
    { type: "heading", text: issue.featuredLabel, color: TONE.ink },
    ...features(issue).map((feature): Block => ({
      type: "card",
      card: featureCard(feature),
    })),
    { type: "text", text: issue.signoff },
  ];
}

export const gdgcIssue = terminal(PUBLIC, ({ params }) => {
  const issue = gdgcIssueByVersion(params.version ?? "");
  if (!issue) return NOT_FOUND;
  return page({
    banner: "GDGC",
    accent: "sky",
    aside: [`issue ${issue.version} · ${issue.term}`],
    status: issue.sendLabel,
    command: issue.command,
    body: issue.campaign ? campaignBody(issue) : plainBody(issue),
  });
});

export const gdgcArchive = terminal(PUBLIC, () => {
  const issues = [...GDGC_ISSUES].reverse();
  const latest = issues[0];
  return page({
    banner: "GDGC",
    accent: "sky",
    aside: latest ? [`latest issue ${latest.version}`] : [],
    status: `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`,
    command: "gdgc --list",
    body: [
      {
        type: "text",
        text: "Opportunities, civic projects and events from GDG on Campus UGA.",
      },
      {
        type: "entries",
        items: issues.map((issue) => ({
          label: `#${issue.version}`,
          meta: issue.sendLabel,
          current: issue === latest,
          chip:
            issue === latest
              ? { label: "latest", color: TONE.brand }
              : undefined,
          headline: issue.title,
          text: issue.preview,
          path: `/newsletters/gdgc/${issue.version}`,
        })),
        empty: "No issues yet.",
      },
    ],
  });
});
