import {
  ChangelogEmail,
  paintCss,
  webRenderContext,
  type ChangelogIssue,
} from "@devdogsuga/newsletter";

import "./content.css";

type EmailProps = Parameters<typeof ChangelogEmail>[0];

/**
 * One issue inside the page shell. The email keeps its own email-safe palette
 * and `paintCss()` base layer (Outlook and dark-mode rules live in the
 * newsletter package); only the frame around it is the site's.
 */
export default function EmailStage({
  issue,
  background,
}: {
  issue: ChangelogIssue;
  /** The newsletter's own `PALETTE.bar`, so the seam matches it. Omit to inherit the page (Paper). */
  background?: string;
}) {
  const props: EmailProps = { issue, ctx: webRenderContext() };
  return (
    <div
      className="content-stage"
      style={background ? { backgroundColor: background } : undefined}
    >
      <div className="content-stage-inner">
        <style dangerouslySetInnerHTML={{ __html: paintCss() }} />
        <ChangelogEmail {...props} />
      </div>
    </div>
  );
}
