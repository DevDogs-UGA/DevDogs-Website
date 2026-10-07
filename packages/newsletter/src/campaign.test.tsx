import { describe, expect, it } from "vitest";
import { assertIssueReadyToSend } from "./campaign.js";
import { gdgcIssueByVersion } from "./gdgc-issues.js";
import { issueByVersion, ISSUES } from "./issues.js";
import { previewRenderContext, renderIssueDocument } from "./export/index.js";

describe("Georgia 311 campaign", () => {
  const issue = gdgcIssueByVersion("1")!;
  it("uses the meeting config for dates, rooms and duration", () => {
    expect(ISSUES.some((item) => item.campaign)).toBe(false);
    expect(issueByVersion("3.0.4")).toBeUndefined();
    expect(issue.featured).toHaveLength(3);
    for (const { meeting } of issue.featured) {
      expect(Date.parse(meeting.endsAt) - Date.parse(meeting.startsAt)).toBe(
        30 * 60_000,
      );
      expect(meeting.countsForCredit).toBe(false);
    }
    const html = renderIssueDocument(issue, previewRenderContext());
    expect(html).toContain("Dawson 110");
    expect(html).toContain("DLW 124");
    expect(html).toContain("Virtual and recorded");
    expect(html).toContain("Builders and designers");
    expect(html).toContain('href="mailto:devdogs@uga.edu"');
    expect(html.match(/alt="DevDogs"/g)).toHaveLength(1);
    expect(html.indexOf('alt="DevDogs"')).toBeLessThan(
      html.indexOf("Keep building with DevDogs"),
    );
  });
  it("blocks sends with pending application or event links", () => {
    expect(() =>
      assertIssueReadyToSend({
        ...issue,
        campaign: {
          ...issue.campaign!,
          cta: { ...issue.campaign!.cta, url: "[GOOGLE FORM URL]" },
        },
      }),
    ).toThrow("Google Form application URL");
    const ready = {
      ...issue,
      campaign: {
        ...issue.campaign!,
        cta: {
          ...issue.campaign!.cta,
          url: "https://docs.google.com/forms/d/e/example/viewform",
        },
      },
      featured: issue.featured.map((f) => ({
        ...f,
        meeting: {
          ...f.meeting,
          rsvpUrl: "https://gdg.community.dev/events/example/",
        },
      })) as typeof issue.featured,
    };
    expect(() => assertIssueReadyToSend(ready)).not.toThrow();
    ready.featured[0].meeting.rsvpUrl = null;
    expect(() => assertIssueReadyToSend(ready)).toThrow("Bevy event URL");
    expect(() =>
      assertIssueReadyToSend(issueByVersion("3.0.3")!),
    ).not.toThrow();
  });
});
