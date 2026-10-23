import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  GDGC_ISSUES,
  gdgcIssueByVersion,
  PALETTE,
} from "@devdogsuga/newsletter";

import EmailStage from "~/components/Content/EmailStage";
import "~/components/Content/content.css";
import { Breadcrumbs } from "~/ui/breadcrumbs";

/**
 * /newsletters/gdgc/[version], one issue, rendered from the same email-safe
 * components the exported send uses. The only thing that differs is the
 * `RenderContext`: pages get the `next/font` CSS variables the root layout
 * sets and SVG data-URI images; the send gets literal font stacks and
 * embedded PNGs. Copy cannot drift between the archive and an inbox because
 * there is exactly one copy. The shell is Paper, like the archive.
 */

/**
 * Static data from `@devdogsuga/newsletter`; changes only with a deploy.
 */
export const revalidate = false;

export function generateStaticParams() {
  return GDGC_ISSUES.map((issue) => ({ version: issue.version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  const issue = gdgcIssueByVersion(version);
  // A dead link still gets unfurled, so it gets an honest card rather than
  // the archive's own title.
  if (!issue) return { title: "GDGC Newsletter | DevDogs" };
  return {
    title: `GDGC Newsletter Issue ${issue.version} | DevDogs`,
    description: issue.preview,
  };
}

export default async function GdgcIssue({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const issue = gdgcIssueByVersion(version);
  if (!issue) notFound();

  return (
    <div className="paper content-paper">
      <div className="wrap content-crumbs">
        <Breadcrumbs
          items={[
            { label: "Newsletters", href: "/newsletters/gdgc" },
            { label: `Issue ${issue.version}` },
          ]}
        />
      </div>
      <h1 className="sr-only">
        GDGC Newsletter issue {issue.version}: {issue.tagline}
      </h1>
      <EmailStage issue={issue} background={PALETTE.bar} />
    </div>
  );
}
