"use client";

import { useState, type ReactNode } from "react";
import {
  BookOpenIcon,
  CalendarCheckIcon,
  FlagIcon,
  KeyIcon,
  LinkSimpleIcon,
  ListIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  UserIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";

import { AnnouncementNotice } from "~/components/AnnouncementBanner";
import { AttendanceBannerView } from "~/components/AttendanceBanner";
import SignInButton, { JoinButton } from "~/components/TopNav/SignInButton";
import { Avatar, AvatarBadge, AvatarFallback } from "~/ui/avatar";
import { AppShell, PageHeading, Panel, SideWho } from "~/ui/app-shell";
import { Breadcrumbs } from "~/ui/breadcrumbs";
import { Button } from "~/ui/button";
import { NavigationProgressSample } from "~/ui/navigation-progress";
import Pagination from "~/ui/pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/ui/sheet";
import { SideNav, SideNavGroup, SideNavLink } from "~/ui/side-nav";
import { Tab, Tabs } from "~/ui/tabs";
import { KIT_GROUPS } from "../groups";
import "~/components/TopNav/topnav.css";

const FINISHES = [
  { finish: "cosmic", label: "Cosmic · DevDogs" },
  { finish: "paper", label: "Paper · GDG on Campus" },
] as const;

type Finish = (typeof FINISHES)[number]["finish"];

const note = (title: string) =>
  KIT_GROUPS.find((g) => g.title === title)?.note ?? "";

function Group({
  title,
  intro,
  finishes = ["cosmic", "paper"],
  children,
}: {
  title: string;
  intro?: string;
  finishes?: readonly Finish[];
  children: (finish: Finish) => ReactNode;
}) {
  return (
    <section className="grp" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2>{title}</h2>
      <p dangerouslySetInnerHTML={{ __html: intro ?? note(title) }} />
      <div className="pair">
        {FINISHES.filter((f) => finishes.includes(f.finish)).map(
          ({ finish, label }) => (
            <div key={finish} className={`pane ${finish}`} data-label={label}>
              {children(finish)}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

const noop = () => undefined;
const keep = (e: Event) => e.preventDefault();

/** A positioning context so an open sheet stays inside the frame. */
function Stage({
  height,
  children,
}: {
  height: number;
  children: (container: HTMLElement | null) => ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setEl}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        transform: "translateZ(0)",
        background:
          "repeating-linear-gradient(135deg, var(--surface) 0 14px, var(--bg) 14px 28px)",
      }}
    >
      {el ? children(el) : null}
    </div>
  );
}

/** A bar frame for the static replicas: the live bar is the one at the top of this page. */
function BarFrame({ children }: { children: ReactNode }) {
  return (
    <ul className="topnav" style={{ position: "relative", paddingInline: 16 }}>
      {children}
    </ul>
  );
}

function BarLinks({ current }: { current?: string }) {
  return (
    <>
      {["Community", "Events", "Partners", "Docs"].map((label) => (
        <li key={label} style={{ display: "flex", alignSelf: "stretch" }}>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={current === label ? "topnav-link on" : "topnav-link"}
            aria-current={current === label ? "page" : undefined}
          >
            {label}
          </a>
        </li>
      ))}
    </>
  );
}

/** The folded (900px and below) search: the icon alone, so three bars fit the pane. */
function BarSearch() {
  return (
    <button
      type="button"
      className="search relative"
      aria-label="Search"
      style={{ width: 40, padding: 0, justifyContent: "center" }}
    >
      <MagnifyingGlassIcon aria-hidden weight="bold" />
    </button>
  );
}

/** Every state of the live navigation primitives and shell. */
export default function NavigationSection() {
  return (
    <>
      <Group
        title="Top bar states"
        intro="The live bar is the one at the top of this page (its Docs and avatar panels open on hover). These are the three states it takes: signed out, signed in, and signed in with account setup unfinished (the badge is the ui Avatar's status dot). The current link wears the 4px bar on the bottom line."
        finishes={["cosmic"]}
      >
        {() => (
          <div className="col" style={{ gap: 14 }}>
            <p className="eyebrow">Signed out</p>
            <BarFrame>
              <BarLinks current="Events" />
              <li className="topnav-end">
                <BarSearch />
                <SignInButton />
                <JoinButton />
              </li>
            </BarFrame>
            <p className="eyebrow">Signed in</p>
            <BarFrame>
              <BarLinks current="Docs" />
              <li className="topnav-end">
                <BarSearch />
                <Avatar>
                  <AvatarFallback>SF</AvatarFallback>
                </Avatar>
              </li>
            </BarFrame>
            <p className="eyebrow">Signed in, setup unfinished, officer</p>
            <BarFrame>
              <BarLinks current="Community" />
              <li className="topnav-end">
                <BarSearch />
                <Button variant="ghost" size="sm">
                  Console
                </Button>
                <Avatar>
                  <AvatarFallback>SF</AvatarFallback>
                  <AvatarBadge aria-hidden>
                    <WarningCircleIcon weight="bold" />
                  </AvatarBadge>
                </Avatar>
              </li>
            </BarFrame>
          </div>
        )}
      </Group>

      <Group
        title="Menu panels"
        intro="The Docs and avatar panels are the kit's .menu card, hoisted into the bar's one viewport. Rows are .menu a with the stepped hover; the verification nudge is the warn alert. Shown static here; hover Docs or the avatar above to see them live."
        finishes={["cosmic"]}
      >
        {() => (
          <div className="spec" style={{ alignItems: "flex-start", gap: 28 }}>
            <div
              className="menu topnav-card"
              style={{ width: 288, padding: 6 }}
            >
              <div className="tn-who">
                <b>Sam Fields</b>
                <span>Member</span>
              </div>
              <hr className="tn-rule" />
              <a
                className="tn-row"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                <UserIcon weight="bold" /> Account
              </a>
              <a
                className="tn-row"
                aria-current="page"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                <CalendarCheckIcon weight="bold" /> Attendance
              </a>
              <a
                className="tn-row"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                <KeyIcon weight="bold" /> OAuth Client
              </a>
              <hr className="tn-rule" />
              <button type="button" className="tn-row danger">
                Sign Out
              </button>
            </div>
            <div
              className="menu topnav-card"
              style={{ width: 300, padding: 6 }}
            >
              {[
                ["Platform", "The DevDogs platform and its sign-in."],
                ["Workshops", "Step-by-step courses."],
              ].map(([name, text]) => (
                <a
                  key={name}
                  className="tn-row"
                  href="#"
                  style={{ alignItems: "flex-start" }}
                  onClick={(e) => e.preventDefault()}
                >
                  <BookOpenIcon weight="bold" />
                  <span className="tn-row-copy">
                    <span>{name}</span>
                    <span>{text}</span>
                  </span>
                </a>
              ))}
            </div>
            <div style={{ width: 288 }}>
              <button type="button" className="alert warn tn-verify">
                <span>
                  <FlagIcon weight="bold" /> Finish Account Setup
                </span>
                <span>2/5 steps complete</span>
              </button>
            </div>
          </div>
        )}
      </Group>

      <Group
        title="Mobile menu"
        intro="At 900px and below the links fold into the toggle, which opens a plain left panel (Sheet variant=panel), not the 480px drawer. Pinned open inside a frame."
        finishes={["cosmic"]}
      >
        {() => (
          <div className="col" style={{ gap: 12 }}>
            <Button variant="ghost" size="icon-sm" aria-label="Menu">
              <ListIcon weight="bold" />
            </Button>
            <Stage height={480}>
              {(container) => (
                <Sheet open modal={false} onOpenChange={noop}>
                  <SheetContent
                    side="left"
                    variant="panel"
                    container={container}
                    showCloseButton={false}
                    onOpenAutoFocus={keep}
                    onInteractOutside={keep}
                    onEscapeKeyDown={keep}
                    className="w-[min(20rem,calc(100%-2rem))] gap-0 p-0"
                  >
                    <SheetHeader className="p-4">
                      <SheetTitle className="text-left">Menu</SheetTitle>
                    </SheetHeader>
                    <div className="tn-mobile">
                      <nav className="mnav open" aria-label="Main">
                        <a href="#" className="on" aria-current="page">
                          Community
                        </a>
                        <a href="#">Events</a>
                        <a href="#">Partners</a>
                        <a href="#">Docs</a>
                      </nav>
                      <SideNav aria-label="Console">
                        <SideNavGroup>Console</SideNavGroup>
                        <SideNavLink
                          href="#"
                          icon={<QrCodeIcon weight="bold" />}
                        >
                          QR Codes
                        </SideNavLink>
                      </SideNav>
                      <Button variant="secondary" size="sm">
                        More from DevDogs
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
            </Stage>
          </div>
        )}
      </Group>

      <Group title="Tabs and breadcrumbs">
        {() => (
          <div className="col" style={{ gap: 22 }}>
            <Tabs aria-label="Account sections">
              <Tab href="#" active>
                Profile
              </Tab>
              <Tab href="#">Accounts</Tab>
              <Tab href="#">Notifications</Tab>
              <Tab href="#" icon={<KeyIcon />}>
                Developer
              </Tab>
            </Tabs>
            <Breadcrumbs
              items={[
                { label: "Events", href: "#" },
                { label: "October", href: "#" },
                { label: "Georgia 311 Demo Day" },
              ]}
            />
            <Breadcrumbs
              items={[{ label: "Events", href: "#" }, { label: "Check in" }]}
            />
          </div>
        )}
      </Group>

      <Group
        title="Pager"
        intro="Previous and next are always drawn, dimmed when there is nowhere to go. The window keeps the first and last page and one either side of the current. A single page renders nothing at all."
      >
        {() => (
          <div className="col" style={{ gap: 22 }}>
            <Pagination
              page={1}
              totalPages={7}
              buildHref={(n) => `#p${n}`}
              label="events"
              totalCount={64}
            />
            <Pagination page={4} totalPages={9} buildHref={(n) => `#p${n}`} />
            <Pagination page={7} totalPages={7} buildHref={(n) => `#p${n}`} />
            <Pagination page={1} totalPages={1} buildHref={(n) => `#p${n}`} />
            <p className="small muted">
              (The fourth pager is one page long, so nothing is drawn above this
              line.)
            </p>
          </div>
        )}
      </Group>

      <Group title="Side nav">
        {() => (
          <div className="spec" style={{ alignItems: "flex-start", gap: 36 }}>
            <SideNav aria-label="Settings" style={{ width: 232 }}>
              <SideNavGroup>Account</SideNavGroup>
              <SideNavLink href="#" icon={<UserIcon />}>
                Profile
              </SideNavLink>
              <SideNavLink href="#" icon={<LinkSimpleIcon />}>
                Connected accounts
              </SideNavLink>
              <SideNavGroup>Developer</SideNavGroup>
              <SideNavLink href="#" icon={<KeyIcon />} count={2}>
                OAuth apps
              </SideNavLink>
              <SideNavGroup>Console</SideNavGroup>
              <SideNavLink href="#" icon={<CalendarCheckIcon />}>
                Meetings
              </SideNavLink>
              <SideNavLink href="#" icon={<QrCodeIcon />}>
                QR codes
              </SideNavLink>
            </SideNav>
          </div>
        )}
      </Group>

      <Group
        title="App shell"
        intro="The settings and console frame: the side column (sticky at 901px and up, a scroller with the current page first below), then the page heading and flat panels. Resize to 900px or less to see the side stack."
        finishes={["cosmic"]}
      >
        {() => (
          <div style={{ border: "1px dashed var(--line-strong)" }}>
            <AppShell
              side={
                <>
                  <SideWho
                    avatar={
                      <Avatar>
                        <AvatarFallback>SF</AvatarFallback>
                      </Avatar>
                    }
                    name="Sam Fields"
                    handle="Member"
                  />
                  <SideNav aria-label="Settings">
                    <SideNavGroup>Account</SideNavGroup>
                    <SideNavLink href="#" icon={<UserIcon />}>
                      Profile
                    </SideNavLink>
                    <SideNavLink href="#" icon={<LinkSimpleIcon />}>
                      Connected accounts
                    </SideNavLink>
                    <SideNavGroup>Developer</SideNavGroup>
                    <SideNavLink href="#" icon={<KeyIcon />} active>
                      OAuth apps
                    </SideNavLink>
                  </SideNav>
                </>
              }
            >
              <PageHeading
                crumbs={[
                  { label: "Settings", href: "#" },
                  { label: "Profile" },
                ]}
                title="Profile"
                description="Your details and what your public profile shows. Nothing changes until you press Save."
                actions={
                  <Button variant="secondary">View public profile</Button>
                }
              />
              <Panel
                id="gallery-details"
                title="Your details"
                help="Shown across DevDogs instead of your legal name."
              >
                <p className="small muted">Fields go here.</p>
              </Panel>
              <Panel id="gallery-links" title="Links">
                <p className="small muted">
                  Adjacent panels are separated by a hairline.
                </p>
              </Panel>
            </AppShell>
          </div>
        )}
      </Group>

      <Group
        title="Route progress and banners"
        intro="The route-change bar is a 4px stepped bar in the brand red (shown at 20%, 60% and 85%; the live one is fixed to the top of the window). Below: the attendance strip and the announcement notice in each tone."
        finishes={["cosmic"]}
      >
        {() => (
          <div className="col" style={{ gap: 22 }}>
            <NavigationProgressSample value={0.2} />
            <NavigationProgressSample value={0.6} />
            <NavigationProgressSample value={0.85} />
            <AttendanceBannerView
              meetingId="gallery"
              title="Weekly meeting · DLW 124"
              onDismiss={noop}
            />
            {(["urgent", "info"] as const).map((tone) => (
              <div key={tone} style={{ position: "relative", paddingTop: 44 }}>
                <AnnouncementNotice
                  tone={tone}
                  eyebrow={tone === "urgent" ? "Now open" : "Heads up"}
                  message="Applications for the executive board close Wednesday at 11:59 PM."
                  action={{ label: "Apply now", href: "#" }}
                  onDismiss={noop}
                />
              </div>
            ))}
          </div>
        )}
      </Group>
    </>
  );
}
