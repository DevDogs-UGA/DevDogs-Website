import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ISSUES, issueByVersion, PALETTE } from "@devdogsuga/newsletter";

import EmailStage from "~/components/Content/EmailStage";
import "~/components/Content/content.css";
import { Breadcrumbs } from "~/ui/breadcrumbs";

/**
 * /changelog/[version], one issue, rendered from the same email-safe
 * components the exported send uses. The only thing that differs is the
 * `RenderContext`: pages get the `next/font` CSS variables the root layout
 * sets and SVG data-URI images; the send gets literal font stacks and
 * embedded PNGs. Copy cannot drift between the archive and an inbox because
 * there is exactly one copy.
 */

/**
 * Static data from `@devdogsuga/newsletter`; changes only with a deploy.
 */
export const revalidate = false;

export function generateStaticParams() {
  return ISSUES.map((issue) => ({ version: issue.version }));
}

export async function generateMetadata({
  params,
}: PageProps<"/changelog/[version]">): Promise<Metadata> {
  const { version } = await params;
  const issue = issueByVersion(version);
  // A dead link still gets unfurled, so it gets an honest card rather than
  // the archive's own title.
  if (!issue) return { title: "Changelog | DevDogs" };
  return {
    title: `Changelog v${issue.version} | DevDogs`,
    description: issue.preview,
  };
}

export default async function ChangelogIssue({
  params,
}: PageProps<"/changelog/[version]">) {
  const { version } = await params;
  const issue = issueByVersion(version);
  if (!issue) notFound();

  return (
    <>
      <div className="wrap content-crumbs">
        <Breadcrumbs
          items={[
            { label: "Changelog", href: "/changelog" },
            { label: `v${issue.version}` },
          ]}
        />
      </div>
      <h1 className="sr-only">
        Changelog v{issue.version}: {issue.tagline}
      </h1>
      <EmailStage issue={issue} background={PALETTE.bar} />
    </>
  );
}
