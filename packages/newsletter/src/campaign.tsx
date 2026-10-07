import type { CSSProperties, ReactNode } from "react";
import type { RenderContext } from "./assets.js";
import { bc, tc } from "./darkmode.js";
import type { ChangelogIssue } from "./issues.js";
import { SITE } from "./theme.js";

export interface CampaignContent {
  subject: string;
  preheader: string;
  chapter: string;
  series: string;
  eyebrow: string;
  title: string;
  intro: string[];
  sections: {
    heading: string;
    paragraphs?: string[];
    items?: { title: string; text: string }[];
  }[];
  cta: { heading: string; label: string; url: string; paragraphs: string[] };
  footer: string;
  promo: { heading: string; text: string; url: string; label: string };
}

/** Pending URLs are reviewable in exports, but cannot reach a send. */
export function assertIssueReadyToSend(issue: ChangelogIssue): void {
  if (!issue.campaign) return;
  const pending: string[] = [];
  if (!issue.campaign.cta.url.startsWith("https://"))
    pending.push("Google Form application URL");
  for (const { meeting } of issue.featured) {
    if (!meeting.rsvpUrl) pending.push(`Bevy event URL for ${meeting.slug}`);
  }
  if (pending.length)
    throw new Error(
      `v${issue.version} is not ready to send: ${pending.join(", ")}. Fill these in before sending; render remains available for review.`,
    );
}

const INK = "#1e1e1e",
  BLUE = "#185abc";
const TABLE = {
  role: "presentation",
  cellPadding: 0,
  cellSpacing: 0,
  border: 0,
} as const;
const font: CSSProperties = {
  fontFamily: "'Google Sans', Arial, Helvetica, sans-serif",
  fontSize: 16,
  lineHeight: 1.65,
  color: INK,
};
function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p className={tc(INK)} style={{ ...font, margin: "0 0 16px" }}>
      {children}
    </p>
  );
}
function Panel({
  children,
  color = "#ffffff",
  id,
}: {
  children: ReactNode;
  color?: string;
  id?: string;
}) {
  return (
    <tr>
      <td
        id={id}
        {...{ bgcolor: color }}
        className={bc(color)}
        style={{ padding: "28px 32px" }}
      >
        {children}
      </td>
    </tr>
  );
}
function Heading({ children }: { children: ReactNode }) {
  return (
    <h2
      className={tc(INK)}
      style={{ ...font, fontSize: 24, lineHeight: 1.3, margin: "0 0 18px" }}
    >
      {children}
    </h2>
  );
}
function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={tc(BLUE)}
      style={{ color: BLUE, fontWeight: 700 }}
    >
      {children}
    </a>
  );
}

/** The approved GDG newsletter style, shared by the archive and MIME export. */
export function CampaignEmail({
  issue,
  ctx,
}: {
  issue: ChangelogIssue;
  ctx: RenderContext;
}) {
  const d = issue.campaign!;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <table
      {...TABLE}
      width="600"
      style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}
    >
      <tbody>
        <tr>
          <td>
            <style>{`@font-face{font-family:'Google Sans';src:url('${SITE}/brand/newsletter/GoogleSans-Regular.ttf')}@font-face{font-family:'Google Sans';font-weight:700;src:url('${SITE}/brand/newsletter/GoogleSans-Bold.ttf')}`}</style>
          </td>
        </tr>
        <tr>
          <td {...{ bgcolor: "#ffe7a5" }} className={bc("#ffe7a5")}>
            <img
              src={ctx.assets.campaignImage("header")}
              width={600}
              alt="Colorful developer graphics: circles, braces, globe and slashes"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </td>
        </tr>
        <Panel color="#ffe7a5">
          <img
            src={ctx.assets.campaignImage("chapter")}
            width={260}
            alt="GDG on Campus UGA"
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              marginBottom: 20,
            }}
          />
          <Paragraph>
            <strong>{d.chapter}</strong>
            <br />
            {d.series}
          </Paragraph>
        </Panel>
        <Panel color="#f0f0f0">
          <Paragraph>
            <strong>{d.eyebrow}</strong>
          </Paragraph>
          <h1
            className={tc(INK)}
            style={{
              ...font,
              fontSize: 42,
              lineHeight: 1.12,
              margin: "0 0 24px",
            }}
          >
            {issue.tagline}
          </h1>
          {d.intro.map((p) => (
            <Paragraph key={p}>{p}</Paragraph>
          ))}
        </Panel>
        {/* Meeting data is the same config consumed by the events pages. */}
        <Panel color="#c3ecf6">
          <Heading>{issue.featuredLabel}</Heading>
          <Paragraph>All three sessions cover the same material.</Paragraph>
          {issue.featured.map(({ meeting }) => {
            const virtual = meeting.location.startsWith("Virtual");
            const location = virtual
              ? "Virtual and recorded"
              : `In-person · ${meeting.building === "Other" ? meeting.location : `${meeting.building} ${meeting.location}`}`;
            return (
              <Paragraph key={meeting.slug}>
                <strong>
                  {date.format(new Date(meeting.startsAt))} ·{" "}
                  {time.format(new Date(meeting.startsAt))}–
                  {time.format(new Date(meeting.endsAt))}
                </strong>
                <br />
                <Link
                  href={meeting.rsvpUrl ?? `${SITE}/events/${meeting.slug}`}
                >
                  {meeting.title}
                </Link>
                <br />
                {location}
                {virtual && !meeting.rsvpUrl ? " · Bevy link pending" : ""}
              </Paragraph>
            );
          })}
        </Panel>
        {d.sections.map((section) => (
          <Panel key={section.heading}>
            <Heading>{section.heading}</Heading>
            {section.paragraphs?.map((p) => (
              <Paragraph key={p}>{p}</Paragraph>
            ))}
            {section.items?.map((item) => (
              <Paragraph key={item.title}>
                <strong>{item.title}</strong>
                <br />
                {item.text}
              </Paragraph>
            ))}
          </Panel>
        ))}
        <Panel color="#ccf6c5">
          <Heading>{d.cta.heading}</Heading>
          <table {...TABLE}>
            <tbody>
              <tr>
                <td
                  {...{ bgcolor: BLUE }}
                  className={bc(BLUE)}
                  style={{ padding: "18px 32px", borderRadius: 24 }}
                >
                  <a
                    href={
                      d.cta.url.startsWith("https://")
                        ? d.cta.url
                        : "#application-link-pending"
                    }
                    className={tc("#ffffff")}
                    style={{
                      ...font,
                      color: "#ffffff",
                      fontSize: 18,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {d.cta.label}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          {!d.cta.url.startsWith("https://") && (
            <Paragraph>
              <span id="application-link-pending">
                {d.cta.url} — link pending
              </span>
            </Paragraph>
          )}
          {d.cta.paragraphs.map((p) => (
            <Paragraph key={p}>{p}</Paragraph>
          ))}
        </Panel>
        <Panel color="#ffe7a5">
          <img
            src={ctx.assets.campaignImage("devdogs")}
            width={180}
            alt="DevDogs"
            style={{ display: "block", height: "auto", marginBottom: 20 }}
          />
          <Heading>{d.promo.heading}</Heading>
          <Paragraph>{d.promo.text}</Paragraph>
          <Link href={d.promo.url}>{d.promo.label}</Link>
        </Panel>
        <Panel>
          <Paragraph>
            {issue.signoff
              .split(/(devdogs@uga.edu|devdogsuga.org)/)
              .map((part, index) =>
                part === "devdogs@uga.edu" ? (
                  <Link key={index} href="mailto:devdogs@uga.edu">
                    {part}
                  </Link>
                ) : part === "devdogsuga.org" ? (
                  <Link key={index} href={SITE}>
                    {part}
                  </Link>
                ) : (
                  part
                ),
              )}
          </Paragraph>
          <Paragraph>
            {d.chapter} · {d.series} · Issue {issue.version}
          </Paragraph>
        </Panel>
      </tbody>
    </table>
  );
}
