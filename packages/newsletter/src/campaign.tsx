import { timeRange } from "./date-format.js";
import { CAMPAIGN_FONT_CSS } from "./campaign-fonts.js";
import type { CSSProperties, ReactNode } from "react";
import type { RenderContext } from "./assets.js";
import type { PairedCampaignImage } from "./campaign-assets.js";
import {
  bc,
  brc,
  DARK_IMAGE_CLASS,
  LIGHT_IMAGE_CLASS,
  tc,
} from "./darkmode.js";
import type { ChangelogIssue } from "./issues.js";
import { GDGC, GDGC_FONT_STACK, SITE } from "./theme.js";

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

const INK = GDGC.ink,
  BLUE = GDGC.blue;
const TABLE = {
  role: "presentation",
  cellPadding: 0,
  cellSpacing: 0,
  border: 0,
} as const;
const font: CSSProperties = {
  fontFamily: GDGC_FONT_STACK,
  fontSize: 16,
  lineHeight: 1.65,
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
  color = "#f0f0f0",
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
        className={`${bc(color)} ${tc(INK)}`}
        style={{ padding: "24px 32px" }}
      >
        {children}
      </td>
    </tr>
  );
}
function Card({ children, color }: { children: ReactNode; color: string }) {
  return (
    <table {...TABLE} width="100%" style={{ marginBottom: 16 }}>
      <tbody>
        <tr>
          <td
            {...{ bgcolor: color }}
            className={`${bc(color)} ${tc(INK)} ${brc(INK)}`}
            style={{
              ...font,
              padding: "20px 24px",
              border: `2px solid ${INK}`,
              borderRadius: 10,
              verticalAlign: "middle",
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
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
      style={{ fontFamily: GDGC_FONT_STACK, fontWeight: 700 }}
    >
      {children}
    </a>
  );
}

/**
 * A graphic and its dark twin. The twin hides inline (and from classic
 * Outlook via `mso-hide`), so every client without a dark-mode hook — Gmail
 * included — shows the light one; `darkModeCss({ campaign })` swaps them.
 */
function PairedImage({
  ctx,
  name,
  style,
  ...img
}: {
  ctx: RenderContext;
  name: PairedCampaignImage;
  width: number;
  alt: string;
  style: CSSProperties;
}) {
  return (
    <>
      <img
        {...img}
        src={ctx.assets.campaignImage(name)}
        className={LIGHT_IMAGE_CLASS}
        style={style}
      />
      <div
        className={DARK_IMAGE_CLASS}
        style={{ display: "none", msoHide: "all" } as CSSProperties}
      >
        <img
          {...img}
          src={ctx.assets.campaignImage(`${name}-dark`)}
          style={style}
        />
      </div>
    </>
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
  const sectionPanels = d.sections.map((section, sectionIndex) => (
    <Panel
      key={section.heading}
      color={sectionIndex === 2 ? "#ffe7a5" : "#f0f0f0"}
    >
      <Heading>{section.heading}</Heading>
      {section.paragraphs?.map((p) => (
        <Paragraph key={p}>{p}</Paragraph>
      ))}
      {section.items?.map((item, index) => (
        <Card
          key={item.title}
          color={
            sectionIndex === 0
              ? ["#c3ecf6", "#ccf6c5", "#f8d8d8"][index % 3]!
              : "#f0f0f0"
          }
        >
          <strong>{item.title}</strong>
          <br />
          {item.text}
        </Card>
      ))}
    </Panel>
  ));
  return (
    <table
      {...TABLE}
      width="600"
      className={`gdgc-email ${tc(INK)}`}
      style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}
    >
      <tbody>
        <tr>
          <td>
            <style>
              {CAMPAIGN_FONT_CSS +
                "\n" +
                [INK, BLUE, "#ffffff"]
                  .map((color) => `.${tc(color)}{color:${color}}`)
                  .join("\n")}
            </style>
          </td>
        </tr>
        <tr>
          <td {...{ bgcolor: "#ffe7a5" }} className={bc("#ffe7a5")}>
            <PairedImage
              ctx={ctx}
              name="header"
              width={600}
              alt="Colorful developer graphics: circles, braces, globe and slashes"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </td>
        </tr>
        <Panel color="#c3ecf6">
          <PairedImage
            ctx={ctx}
            name="chapter"
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
        <Panel color="#c3ecf6">
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
          <img
            src={ctx.assets.campaignImage("civic")}
            width={536}
            alt="South Cobb Regional Library and Nickajack Park in Mableton"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              marginBottom: 16,
            }}
          />
          <p
            className={tc(INK)}
            style={{ ...font, fontSize: 11, margin: "0 0 24px" }}
          >
            South Cobb Regional Library · Nickajack Park, Mableton
            <br />
            Photos: John Phelan / Wikimedia Commons · CC BY 4.0
          </p>
          {d.intro.map((p) => (
            <Paragraph key={p}>{p}</Paragraph>
          ))}
        </Panel>
        {sectionPanels[0]}
        {/* Meeting data is the same config consumed by the events pages. */}
        <Panel color="#ccf6c5">
          <Heading>{issue.featuredLabel}</Heading>
          <Paragraph>All three sessions cover the same material.</Paragraph>
          {issue.featured.map(({ meeting }) => {
            const virtual = meeting.location.startsWith("Virtual");
            const location = virtual
              ? "Virtual and recorded"
              : `In-person · ${meeting.building === "Other" ? meeting.location : `${meeting.building} ${meeting.location}`}`;
            return (
              <Card key={meeting.slug} color="#f0f0f0">
                <strong>
                  {date.format(new Date(meeting.startsAt))} ·{" "}
                  {timeRange(
                    new Date(meeting.startsAt),
                    new Date(meeting.endsAt),
                  )}
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
              </Card>
            );
          })}
        </Panel>
        {sectionPanels.slice(1)}
        <Panel color="#ccf6c5">
          <Heading>{d.cta.heading}</Heading>
          <table {...TABLE}>
            <tbody>
              <tr>
                <td
                  {...{ bgcolor: BLUE }}
                  className={`${bc(BLUE)} ${brc(INK)}`}
                  style={{
                    padding: "22px 32px",
                    borderRadius: 10,
                    border: `2px solid ${INK}`,
                  }}
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
                      fontSize: 20,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {d.cta.label}
                  </a>
                </td>
              </tr>
              <tr>
                <td
                  height={24}
                  aria-hidden="true"
                  style={{ height: 24, fontSize: 0, lineHeight: "24px" }}
                >
                  &nbsp;
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
          <PairedImage
            ctx={ctx}
            name="devdogs"
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
