import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CalendarDotsIcon } from "@phosphor-icons/react/ssr";
import { ISSUES, SITE } from "@devdogsuga/newsletter";

import PageHeader from "~/components/PageHeader";
import "~/components/Content/content.css";
import Badge from "~/ui/badge";
import { Card } from "~/ui/card";
import { Tag } from "~/ui/tag";
import { Timeline, TimelineItem } from "~/ui/timeline";
import { TextLink } from "~/ui/text-link";

/**
 * Static data from `@devdogsuga/newsletter`; changes only with a deploy.
 */
export const revalidate = false;

/**
 * /changelog, the newsletter's archive. The description is the one
 * `config/nav.ts` gives this page under `SEARCH_ONLY_PAGES`; a search result
 * and this unfurl are the same promise about the same page.
 */
export const metadata: Metadata = {
  title: "Changelog | DevDogs",
  description:
    "The weekly DevDogs newsletter: what the club is building and where to show up.",
};

/**
 * A Cosmic timeline of issues (`changelog.html`), newest first. The issues
 * themselves keep the newsletter's own palette; see `/changelog/[version]`.
 */
export default function Changelog() {
  const issues = [...ISSUES].reverse();
  const host = SITE.replace(/^https?:\/\//, "");
  return (
    <>
      <PageHeader
        title="Changelog"
        description="The weekly DevDogs newsletter, versioned like the software it covers. Each issue logs what the club is building and where to show up next."
      />
      <section className="section content-sec">
        <div className="wrap content-layout">
          <Timeline className="content-timeline" aria-label="Issues">
            {issues.map((issue, i) => (
              <TimelineItem key={issue.version}>
                <Card className="quiet content-rel">
                  <div className="content-rh">
                    <span className="content-ver">v{issue.version}</span>
                    {i === 0 && <Badge variant="brand">Latest</Badge>}
                    <span className="muted small content-date">
                      <CalendarDotsIcon weight="bold" aria-hidden />
                      {issue.sendLabel}
                    </span>
                  </div>
                  <h2 className="h2 content-title">{issue.tagline}</h2>
                  <p className="content-lede">{issue.preview}</p>
                  <div className="content-tags">
                    <Tag>{issue.term}</Tag>
                  </div>
                  <div className="content-read">
                    <TextLink asChild>
                      <Link href={`/changelog/${issue.version}`}>
                        Read issue v{issue.version}
                        <ArrowRightIcon weight="bold" aria-hidden />
                      </Link>
                    </TextLink>
                  </div>
                </Card>
              </TimelineItem>
            ))}
          </Timeline>
          <aside className="content-sub" aria-label="Subscribe">
            <Card className="quiet">
              <div className="eyebrow">Subscribe</div>
              <h2 className="h3">Follow along in your terminal</h2>
              <p className="small muted">
                The same page, as plain text. Pipe it into <code>less</code>, or
                run it in a cron job.
              </p>
              <Link className="btn terminal" href="/changelog">
                <b>$</b> curl {host}/changelog
              </Link>
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
