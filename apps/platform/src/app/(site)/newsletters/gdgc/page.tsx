import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { GDGC_ISSUES } from "@devdogsuga/newsletter";

import "~/components/Content/content.css";
import Badge from "~/ui/badge";
import { Breadcrumbs } from "~/ui/breadcrumbs";
import { Card } from "~/ui/card";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";

/**
 * Static data from `@devdogsuga/newsletter`; changes only with a deploy.
 */
export const revalidate = false;

/**
 * /newsletters/gdgc, the newsletter's archive. The description is the one
 * `config/nav.ts` gives this page under `SEARCH_ONLY_PAGES`; a search result
 * and this unfurl are the same promise about the same page.
 */
export const metadata: Metadata = {
  title: "GDGC Newsletter | DevDogs",
  description: "GDG on Campus UGA opportunities, civic projects and events.",
};

/**
 * The GDGC newsletter keeps the Paper finish (`newsletter-gdgc.html`): the
 * page's main region is a `.paper` region nested in the Cosmic site, so the
 * nav and footer stay DevDogs'. The latest issue is the lead card; earlier
 * issues are the grid.
 */
export default function GdgcNewsletters() {
  const [latest, ...past] = [...GDGC_ISSUES].reverse();
  return (
    <div className="paper content-paper">
      <section className="pagehead content-phead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wall" src="/cosmic/a/wall/info.svg" alt="" />
        <div className="wrap">
          <Breadcrumbs
            items={[
              { label: "Newsletters", href: "/newsletters/gdgc" },
              { label: "GDGC" },
            ]}
          />
          <div className="eyebrow k" style={{ margin: "26px 0 0" }}>
            GDG on Campus UGA
          </div>
          <h1 className="display">GDGC Newsletter</h1>
          <p className="lead">
            Opportunities, civic projects and events from GDG on Campus UGA.
          </p>
        </div>
      </section>

      <div className="wrap">
        {latest && (
          <Card
            as="section"
            className="content-latest"
            aria-labelledby="latest-issue"
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>
                Latest issue
              </div>
              <div className="ver">{latest.version}</div>
              <div className="when">{latest.sendLabel}</div>
              <span className="chip">{latest.term}</span>
            </div>
            <div>
              <h2 id="latest-issue">{latest.tagline}</h2>
              <p>{latest.preview}</p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <span className="btn-shadow">
                  <LinkButton
                    href={`/newsletters/gdgc/${latest.version}`}
                    variant="default"
                  >
                    Read issue
                    <ArrowRightIcon weight="bold" aria-hidden />
                  </LinkButton>
                </span>
              </div>
            </div>
          </Card>
        )}

        {past.length > 0 && (
          <section className="content-archive" aria-labelledby="past-issues">
            <div className="content-archive-head">
              <div className="eyebrow">Archive</div>
              <h2 id="past-issues">Past issues</h2>
            </div>
            <div className="content-issues">
              {past.map((issue) => (
                <Card key={issue.version} className="quiet content-issue">
                  <div className="content-issue-row">
                    <span className="eyebrow">{issue.sendLabel}</span>
                    <Badge>{issue.term}</Badge>
                  </div>
                  <div className="v">Issue {issue.version}</div>
                  <p>{issue.preview}</p>
                  <TextLink asChild>
                    <Link href={`/newsletters/gdgc/${issue.version}`}>
                      Read issue {issue.version}
                      <ArrowRightIcon weight="bold" aria-hidden />
                    </Link>
                  </TextLink>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
