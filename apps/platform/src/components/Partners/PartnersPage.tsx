import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  EnvelopeSimpleIcon,
  FileTextIcon,
  GitPullRequestIcon,
  GithubLogoIcon,
  GraduationCapIcon,
  ScalesIcon,
} from "@phosphor-icons/react/ssr";

import Scene from "~/components/Scene";
import Badge from "~/ui/badge";
import { Band } from "~/ui/band";
import { Card } from "~/ui/card";
import { CopyButton } from "~/ui/copy-field";
import LinkButton from "~/ui/link-button";
import { Tag } from "~/ui/tag";
import { TextLink } from "~/ui/text-link";

import "./partners.css";
import {
  EMAIL,
  FAQ,
  HOW_TO,
  MAILTO,
  PROJECT_STEPS,
  STATS,
  TIER_GROUPS,
  TIERS,
  UGA_TRACK,
  WEEK,
  WHY,
} from "./copy";

/** Section opener: eyebrow, then the section title. */
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="eyebrow partners-eyebrow">{eyebrow}</div>
      <h2 className="partners-h2">{title}</h2>
      {children}
    </>
  );
}

function MailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <TextLink asChild>
      <a href={href}>{children}</a>
    </TextLink>
  );
}

/**
 * `/partners` body, as drawn in `partners.html`. Static copy with no request
 * reads, so the page caches. Sections alternate plain and `Band`.
 */
export default function PartnersPage() {
  return (
    <>
      <section
        className="pagehead partners-head"
        style={
          { "--head": "url(/cosmic/img/head-brand.png)" } as React.CSSProperties
        }
      >
        <Scene name="head-brand" />
        <div className="wrap">
          <div className="eyebrow k partners-eyebrow">Partners</div>
          <h1 className="display">Build with DevDogs.</h1>
          <p className="lead partners-lead">
            DevDogs is the large-scale application development club and Google
            Developer Group on Campus at the University of Georgia, and a
            registered student organization at UGA. Partners meet students while
            they build.
          </p>
          <div className="row partners-cta">
            <LinkButton href={MAILTO.partnering} variant="default">
              <EnvelopeSimpleIcon weight="bold" />
              Email {EMAIL}
            </LinkButton>
            <TextLink asChild>
              <a href="#tiers">
                See the tiers <ArrowRightIcon weight="bold" />
              </a>
            </TextLink>
          </div>
        </div>
      </section>

      <section className="section partners-sec partners-stats-section">
        <div className="wrap">
          <dl className="partners-stats">
            {STATS.map((s) => (
              <div key={s.value}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Band id="proof" className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="What members ship"
            title="Real apps, shipped by members."
          />
          <div className="partners-proof">
            <Card className="partners-pc">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="partners-mark"
                src="/cosmic/a/dogdays.png"
                alt="DogDays"
              />
              <div className="row partners-tight">
                <b className="h3">DogDays</b>
                <Badge variant="info">Public alpha</Badge>
              </div>
              <p>
                A course-planning platform for UGA students: conflict-free
                schedules from live registrar data, now in public alpha at
                dogdays.dev.
              </p>
              <div className="row partners-tags">
                <Tag>Next.js</Tag>
                <Tag>TypeScript</Tag>
                <Tag>Supabase</Tag>
              </div>
              <div className="row partners-foot">
                <TextLink asChild>
                  <a href="https://dogdays.dev">
                    dogdays.dev <ArrowUpRightIcon weight="bold" />
                  </a>
                </TextLink>
              </div>
            </Card>
            <Card className="partners-pc">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="partners-mark"
                src="/cosmic/a/dogpack.png"
                alt="DogPack"
              />
              <div className="row partners-tight">
                <b className="h3">DogPack</b>
                <Badge variant="info">Pilot</Badge>
              </div>
              <p>
                DevDogs&rsquo; first mobile app, for iOS and Android. It matches
                students in the same courses so they can form study groups.
              </p>
              <div className="row partners-tags">
                <Tag>Flutter</Tag>
                <Tag>Dart</Tag>
                <Tag>Supabase</Tag>
              </div>
              <div className="row partners-foot">
                <TextLink asChild>
                  <Link href="/#projects">
                    All projects <ArrowRightIcon weight="bold" />
                  </Link>
                </TextLink>
              </div>
            </Card>
            <Card className="partners-pc">
              <GitPullRequestIcon
                weight="bold"
                className="partners-pr-icon"
                aria-hidden
              />
              <b className="h3">A pull request every week</b>
              <p>
                Every Merge Monday, members pick an issue in DogDays or DogPack
                and open a pull request before they leave. Merged pull requests
                ship to the real apps.
              </p>
              <div className="row partners-foot">
                <TextLink asChild>
                  <Link href="/#projects">
                    All projects <ArrowRightIcon weight="bold" />
                  </Link>
                </TextLink>
              </div>
            </Card>
          </div>
          <figure className="partners-proofrow">
            <Card className="k partners-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cosmic/a/hero-photo.jpg"
                alt="Members planning features on a whiteboard"
                width={374}
                height={260}
              />
            </Card>
            <figcaption>
              Every skill level: first-time coders build alongside experienced
              members. The 419 members of our GDG on Campus chapter and the 600+
              students in our Discord are who a partner night reaches.
            </figcaption>
          </figure>
        </div>
      </Band>

      <section className="section partners-sec">
        <div className="wrap">
          <Heading eyebrow="Why partner" title="More than logo placement.">
            <p className="lead partners-lead2">
              Partners meet students while they build, introduce them to their
              technology, become a familiar name before recruiting season, and
              gain a presence in the UGA computing community.
            </p>
          </Heading>
          <div className="partners-cols3">
            {WHY.map((w) => (
              <div key={w.title}>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Band className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="A week at DevDogs"
            title="Where partners show up."
          />
          <div className="partners-cols3">
            {WEEK.map((w) => (
              <div key={w.title}>
                <span className="eyebrow">{w.when}</span>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      <section className="section partners-sec" id="tiers">
        <div className="wrap">
          <Heading
            eyebrow="Co-host a workshop night"
            title="Partnership tiers."
          >
            <p className="muted partners-note">
              Each tier covers one co-hosted Workshop Wednesday night. Recurring
              promotion keeps featuring your company in our posts after the
              event.
            </p>
            <p className="muted partners-note">
              A workshop night runs 6&ndash;7 PM in DLW 124, in a spring
              Workshop Wednesday slot (slots tentative). Per-event attendance
              runs 26&ndash;64.
            </p>
          </Heading>
          <Card className="k partners-tiers-card">
            <table className="partners-tiers">
              <thead>
                <tr>
                  <th />
                  {TIERS.map((t) => (
                    <th key={t.name} scope="col">
                      {t.name}
                      <small>{t.price}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_GROUPS.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="grp">
                      <th colSpan={5}>{g.group}</th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        {r.cells.map(([text, flag], i) => (
                          <td key={i} className={flag}>
                            {text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <div className="partners-tiercards">
              {TIERS.map((t, i) => (
                <article key={t.name} className="partners-tc">
                  <h3>
                    {t.name} <small>{t.price}</small>
                  </h3>
                  <dl>
                    {TIER_GROUPS.flatMap((g) => g.rows).map((r) => {
                      const [text, flag] = r.cells[i] ?? ["", undefined];
                      return (
                        <Fragment key={r.label}>
                          <dt>{r.label}</dt>
                          <dd className={flag}>{text}</dd>
                        </Fragment>
                      );
                    })}
                  </dl>
                </article>
              ))}
            </div>
            <p className="partners-legend">
              A + marks what a tier adds over the one before it.
            </p>
            <div className="partners-custom">
              <div>
                <div className="h3">Buffer Overflow!</div>
                <p className="muted">
                  Want more than one event? We&rsquo;ll build a package around
                  your goals: students tabling for your organization,
                  interactive deep-dive product workshops, multiple sponsored
                  events.
                </p>
              </div>
              <LinkButton href={MAILTO.custom} variant="secondary">
                Ask about a custom package
              </LinkButton>
            </div>
          </Card>
          <p className="small muted partners-pay">
            Once we agree on a tier, we&rsquo;ll send payment details.
          </p>
        </div>
      </section>

      <Band id="how-to-start" className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="How to start"
            title="Co-host a night in three steps."
          />
          <ol className="partners-howto">
            {HOW_TO.map((h) => (
              <li key={h.title}>
                <div className="h3">{h.title}</div>
                <p>{h.body}</p>
              </li>
            ))}
          </ol>
          <div className="row partners-cta">
            <LinkButton href={MAILTO.partnering} variant="default">
              <EnvelopeSimpleIcon weight="bold" />
              Email {EMAIL}
            </LinkButton>
            <TextLink asChild>
              <a href="#tiers">
                See the tiers <ArrowRightIcon weight="bold" />
              </a>
            </TextLink>
          </div>
        </div>
      </section>

      <section className="section partners-sec partners-stats-section">
        <div className="wrap">
          <dl className="partners-stats">
            {STATS.map((s) => (
              <div key={s.value}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Band id="proof" className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="What members ship"
            title="Real apps, shipped by members."
          />
          <div className="partners-proof">
            <Card className="partners-pc">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="partners-mark"
                src="/cosmic/a/dogdays.png"
                alt="DogDays"
              />
              <div className="row partners-tight">
                <b className="h3">DogDays</b>
                <Badge variant="info">Public alpha</Badge>
              </div>
              <p>
                A course-planning platform for UGA students: conflict-free
                schedules from live registrar data, now in public alpha at
                dogdays.dev.
              </p>
              <div className="row partners-tags">
                <Tag>Next.js</Tag>
                <Tag>TypeScript</Tag>
                <Tag>Supabase</Tag>
              </div>
              <div className="row partners-foot">
                <TextLink asChild>
                  <a href="https://dogdays.dev">
                    dogdays.dev <ArrowUpRightIcon weight="bold" />
                  </a>
                </TextLink>
              </div>
            </Card>
            <Card className="partners-pc">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="partners-mark"
                src="/cosmic/a/dogpack.png"
                alt="DogPack"
              />
              <div className="row partners-tight">
                <b className="h3">DogPack</b>
                <Badge variant="info">Pilot</Badge>
              </div>
              <p>
                DevDogs&rsquo; first mobile app, for iOS and Android. It matches
                students in the same courses so they can form study groups.
              </p>
              <div className="row partners-tags">
                <Tag>Flutter</Tag>
                <Tag>Dart</Tag>
                <Tag>Supabase</Tag>
              </div>
              <div className="row partners-foot">
                <TextLink asChild>
                  <Link href="/#projects">
                    All projects <ArrowRightIcon weight="bold" />
                  </Link>
                </TextLink>
              </div>
            </Card>
            <Card className="partners-pc">
              <GitPullRequestIcon
                weight="bold"
                className="partners-pr-icon"
                aria-hidden
              />
              <b className="h3">A pull request every week</b>
              <p>
                Every Merge Monday, members pick an issue in DogDays or DogPack
                and open a pull request before they leave. Merged pull requests
                ship to the real apps.
              </p>
              <div className="row partners-foot">
                <TextLink asChild>
                  <Link href="/#projects">
                    All projects <ArrowRightIcon weight="bold" />
                  </Link>
                </TextLink>
              </div>
            </Card>
          </div>
          <figure className="partners-proofrow">
            <Card className="k partners-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cosmic/a/hero-photo.jpg"
                alt="Members planning features on a whiteboard"
                width={374}
                height={260}
              />
            </Card>
            <figcaption>
              Every skill level: first-time coders build alongside experienced
              members. The 419 members of our GDG on Campus chapter and the 600+
              students in our Discord are who a partner night reaches.
            </figcaption>
          </figure>
        </div>
      </Band>

      <section className="section partners-sec">
        <div className="wrap">
          <Heading eyebrow="Why partner" title="More than logo placement.">
            <p className="lead partners-lead2">
              Partners meet students while they build, introduce them to their
              technology, become a familiar name before recruiting season, and
              gain a presence in the UGA computing community.
            </p>
          </Heading>
          <div className="partners-cols3">
            {WHY.map((w) => (
              <div key={w.title}>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Band className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="A week at DevDogs"
            title="Where partners show up."
          />
          <div className="partners-cols3">
            {WEEK.map((w) => (
              <div key={w.title}>
                <span className="eyebrow">{w.when}</span>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      <section className="section partners-sec" id="tiers">
        <div className="wrap">
          <Heading
            eyebrow="Co-host a workshop night"
            title="Partnership tiers."
          >
            <p className="muted partners-note">
              Each tier covers one co-hosted Workshop Wednesday night. Recurring
              promotion keeps featuring your company in our posts after the
              event.
            </p>
            <p className="muted partners-note">
              A workshop night runs 6&ndash;7 PM in DLW 124, in a spring
              Workshop Wednesday slot (slots tentative). Per-event attendance
              runs 26&ndash;64.
            </p>
          </Heading>
          <Card className="k partners-tiers-card">
            <table className="partners-tiers">
              <thead>
                <tr>
                  <th />
                  {TIERS.map((t) => (
                    <th key={t.name} scope="col">
                      {t.name}
                      <small>{t.price}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_GROUPS.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="grp">
                      <th colSpan={5}>{g.group}</th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        {r.cells.map(([text, flag], i) => (
                          <td key={i} className={flag}>
                            {text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <div className="partners-tiercards">
              {TIERS.map((t, i) => (
                <article key={t.name} className="partners-tc">
                  <h3>
                    {t.name} <small>{t.price}</small>
                  </h3>
                  <dl>
                    {TIER_GROUPS.flatMap((g) => g.rows).map((r) => {
                      const [text, flag] = r.cells[i] ?? ["", undefined];
                      return (
                        <Fragment key={r.label}>
                          <dt>{r.label}</dt>
                          <dd className={flag}>{text}</dd>
                        </Fragment>
                      );
                    })}
                  </dl>
                </article>
              ))}
            </div>
            <p className="partners-legend">
              A + marks what a tier adds over the one before it.
            </p>
            <div className="partners-custom">
              <div>
                <div className="h3">Buffer Overflow!</div>
                <p className="muted">
                  Want more than one event? We&rsquo;ll build a package around
                  your goals: students tabling for your organization,
                  interactive deep-dive product workshops, multiple sponsored
                  events.
                </p>
              </div>
              <LinkButton href={MAILTO.custom} variant="secondary">
                Ask about a custom package
              </LinkButton>
            </div>
          </Card>
          <p className="small muted partners-pay">
            Once we agree on a tier, we&rsquo;ll send payment details.
          </p>
        </div>
      </section>

      <Band id="how-to-start" className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="How to start"
            title="Co-host a night in three steps."
          />
          <ol className="partners-howto">
            {HOW_TO.map((h) => (
              <li key={h.title}>
                <div className="h3">{h.title}</div>
                <p>{h.body}</p>
              </li>
            ))}
          </ol>
          <div className="partners-mondays">
            <span>
              <b>Open this spring:</b>
            </span>
            {OPEN_WEDNESDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
            <span className="muted">
              (spring Workshop Wednesdays, all tentative)
            </span>
          </div>
          <div className="row partners-cta">
            <LinkButton href={MAILTO.tierAndDates} variant="secondary">
              <EnvelopeSimpleIcon weight="bold" />
              Email your tier and dates
            </LinkButton>
          </div>
          <div className="partners-listing">
            <div>
              <div className="h3">Your listing</div>
              <p className="muted">
                Kilobyte and Megabyte partners appear on a Partners section of
                this site; Gigabyte also appears on the home page. The section
                stays hidden until the first partner signs.
              </p>
            </div>
            <Card
              className="partners-lslot"
              aria-label="Example partner listing"
            >
              <div className="partners-logo" aria-hidden="true">
                <span className="partners-burst" />
                <span className="partners-slot-txt">Your Logo Here</span>
              </div>
              <div>
                <b>
                  Acme Co. <Badge variant="info">Example</Badge>
                </b>
                <p>
                  Co-hosted Workshop night. Building with
                  Acme&rsquo;s API.
                </p>
                <TextLink asChild className="small">
                  <Link href="/events">
                    See the event page <ArrowRightIcon weight="bold" />
                  </Link>
                </TextLink>
              </div>
            </Card>
          </div>
        </div>
      </Band>

      <section className="section partners-sec" id="bring-a-project">
        <div className="wrap">
          <div className="partners-split">
            <div>
              <Heading
                eyebrow="Bring a project"
                title="Hand a real problem to a student team."
              >
                <p className="partners-body">
                  Teams of up to four build in the open and check in with your
                  contact at set checkpoints. We vet every project before a team
                  takes it on.
                </p>
              </Heading>
              <div className="partners-terms">
                <span>
                  <ScalesIcon weight="bold" aria-hidden />
                  BSD-3 licensed
                </span>
                <span>
                  <GraduationCapIcon weight="bold" aria-hidden />
                  Students keep copyright
                </span>
                <span>
                  <GithubLogoIcon weight="bold" aria-hidden />
                  Club projects are public
                </span>
              </div>
            </div>
            <ol className="partners-steps3">
              {PROJECT_STEPS.map((s) => (
                <li key={s.title}>
                  <div className="h3">{s.title}</div>
                  <p className="muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <Band id="uga" className="section partners-sec">
        <div className="wrap">
          <Heading
            eyebrow="UGA track"
            title="For departments, faculty and campus orgs."
          >
            <p className="lead partners-lead2">
              No budget needed. DevDogs is a registered student organization at
              UGA, and campus partners work with us on the same Merge Monday and
              Workshop Wednesday rhythm.
            </p>
          </Heading>
          <div className="partners-cols3 partners-uga">
            {UGA_TRACK.map((u) => (
              <div key={u.title}>
                <h3>{u.title}</h3>
                <ul>
                  {u.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="partners-case" id="georgia-311">
            <div>
              <div className="eyebrow partners-eyebrow">Case study</div>
              <h3>Georgia 311 Challenge</h3>
              <p className="muted">
                A civic challenge with the City of Mableton: student teams build
                civic tools around a real city problem.
              </p>
            </div>
            <dl>
              <dt>Client</dt>
              <dd>The City of Mableton</dd>
              <dt>Who builds</dt>
              <dd>Student teams, in the same open-source rhythm as the club</dd>
              <dt>How it started</dt>
              <dd>
                Interest meetings, then team formation
              </dd>
              <dt>Terms</dt>
              <dd>
                The team repos are private while the challenge runs. &ldquo;Code
                is public&rdquo; describes club projects only.
              </dd>
              <dt>Read more</dt>
              <dd>
                <MailLink href="/newsletters/gdgc">
                  The latest newsletter issue <ArrowRightIcon weight="bold" />
                </MailLink>
              </dd>
            </dl>
          </div>
          <p className="partners-body partners-orgs">
            <MailLink href={MAILTO.partnering}>
              Your organization here? Email us <ArrowRightIcon weight="bold" />
            </MailLink>
          </p>
        </div>
      </Band>

      <section className="section partners-sec">
        <div className="wrap">
          <div className="eyebrow partners-eyebrow">Questions</div>
          <div className="partners-faq">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  <CaretRightIcon weight="bold" aria-hidden />
                  {f.q}
                </summary>
                <div className="a">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Band className="section partners-sec">
        <div className="wrap">
          <Card className="k partners-contact">
            <div>
              <div className="eyebrow k partners-eyebrow">
                Interested in partnering with us?
              </div>
              <h2 className="partners-h2">
                Let&rsquo;s build something together.
              </h2>
              <p className="muted">
                Whether your goal is to connect with emerging technical talent,
                introduce students to your tools, strengthen your presence at
                the University of Georgia, or support hands-on learning,
                we&rsquo;d be excited to build a partnership that fits.
              </p>
              <p className="muted partners-p2">
                Your partnership helps DevDogs keep creating free, open-source
                software, running technical programming, and giving students
                opportunities to learn, collaborate, and grow beyond the
                classroom.
              </p>
            </div>
            <div className="partners-contact-col">
              <div>
                <div className="small muted">The DevDogs leadership team</div>
                <div className="partners-addr">
                  <code>{EMAIL}</code>
                  <CopyButton value={EMAIL} label="Copy email address" />
                </div>
              </div>
              <LinkButton href={MAILTO.partnering} variant="default" size="lg">
                <EnvelopeSimpleIcon weight="bold" />
                Email us
              </LinkButton>
              <LinkButton href={MAILTO.packet} variant="secondary">
                <FileTextIcon weight="bold" />
                Request the partnership packet
              </LinkButton>
            </div>
          </Card>
        </div>
      </Band>
    </>
  );
}
