import Link from "next/link";
import { ArrowRightIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react/ssr";
import { Card } from "~/ui/card";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";

/** The approved sponsorship packet's numbers (`FACTS.md`). */
const STATS = [
  { value: "600+", label: "students in our Discord" },
  { value: "419", label: "members of our GDG on Campus chapter" },
  { value: "~2,000", label: "CS and data science undergrads at UGA" },
  { value: "26–64", label: "students at each event" },
] as const;

const EMAIL = "devdogs@uga.edu";

/**
 * The partners call to action: one glowing card with the offer and the "Your
 * Logo Here" burst, then the club's reach in four numbers. A plain section,
 * between two bands.
 */
export default function PartnersSection() {
  return (
    <section id="partners" className="section scroll-mt-20">
      <div className="wrap home-mission-wrap">
        <div className="home-rider-host">
          <Card glow className="home-partner">
            <div>
              <div
                className="eyebrow"
                style={{ marginBottom: 14, color: "var(--brand3)" }}
              >
                Partners
              </div>
              <h2 style={{ marginBottom: 18, textWrap: "balance" }}>
                If you want in on the action, let&rsquo;s talk.
              </h2>
              <p style={{ margin: "0 0 12px" }}>
                Co-host a workshop night, recruit early, or bring us a project.
                Tiers run from $0 to $1,200.
              </p>
              <p className="muted" style={{ margin: "0 0 26px" }}>
                We support the next generation of software engineers, UI
                designers, UX researchers, data scientists, project leaders,
                community builders, and everything in between.
              </p>
              <div className="row" style={{ gap: "12px 20px" }}>
                <LinkButton href="/partners" variant="secondary">
                  How to partner <ArrowRightIcon weight="bold" />
                </LinkButton>
                <TextLink asChild>
                  <a href={`mailto:${EMAIL}`}>
                    <EnvelopeSimpleIcon weight="bold" />
                    {EMAIL}
                  </a>
                </TextLink>
              </div>
            </div>
            <Link
              className="home-logo-slot"
              href={`mailto:${EMAIL}`}
              aria-label="Partner with DevDogs: your logo here"
            >
              <span className="home-burst" aria-hidden="true" />
              <span className="home-slot-txt">
                <b>Your Logo Here</b>
                <u>Reach out →</u>
              </span>
            </Link>
          </Card>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-rider"
            src="/cosmic/a/sprite/office_building.png"
            alt=""
          />
        </div>
        <div className="home-pstats">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
