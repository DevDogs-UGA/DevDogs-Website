import { CheckCircleIcon, UsersIcon } from "@phosphor-icons/react/ssr";

import { CardSkeleton, TableSkeleton } from "~/components/Skeletons";
import PageHeader from "~/components/PageHeader";
import { EVENT_CATEGORIES } from "~/lib/eventKind";
import { Band } from "~/ui/band";
import { Box } from "~/ui/box";
import { Button } from "~/ui/button";
import { Card, ConsoleCard, DangerZone } from "~/ui/card";
import Callout from "~/ui/callout";
import { EmptyState } from "~/ui/empty-state";
import ProgressBar from "~/ui/progress-bar";
import { Separator } from "~/ui/separator";
import { Skeleton } from "~/ui/skeleton";
import { StatTile, StatTiles } from "~/ui/stat-tile";
import { KIT_GROUPS } from "../groups";

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
  children: (finish: Finish) => React.ReactNode;
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

/** Every state of the live surface and feedback primitives. */
export default function SurfacesSection() {
  return (
    <>
      <Group title="Cards">
        {() => (
          <div className="col" style={{ gap: 22 }}>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Neutral
              </div>
              <h3 className="card-title">Quiet container</h3>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Settings groups, sidebars, filters.
              </p>
            </Card>
            <div className="spec">
              {EVENT_CATEGORIES.map((k) => (
                <Card key={k} kind={k} style={{ padding: 16, minWidth: 140 }}>
                  <h3 className="card-title">{k}</h3>
                </Card>
              ))}
            </div>
            <Card kind="social" glow>
              <div className="eyebrow k" style={{ marginBottom: 8 }}>
                Glow
              </div>
              <h3 className="card-title">With the glow</h3>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                One per view, for the lead item.
              </p>
            </Card>
            <Card glow>
              <h3 className="card-title">Glow with no kind (brand)</h3>
            </Card>
            <div className="spec">
              <Card flat style={{ padding: 16 }}>
                <h3 className="card-title">Flat</h3>
              </Card>
              <Card size="lg" style={{ padding: 16 }}>
                <h3 className="card-title">Large (lg)</h3>
              </Card>
              <Card interactive kind="build" style={{ padding: 16 }}>
                <h3 className="card-title">Interactive div</h3>
              </Card>
              <Card
                as="a"
                href="#cards"
                kind="workshop"
                style={{ padding: 16 }}
              >
                <h3 className="card-title">Link card</h3>
              </Card>
            </div>
            <Card as="section" id="gallery-console-card">
              <ConsoleCard.Header
                title="Console card header"
                description="With a description line under the title."
              >
                <Button size="sm" variant="secondary">
                  Action
                </Button>
              </ConsoleCard.Header>
              <ConsoleCard.Content>
                <p style={{ margin: 0 }}>First row of content.</p>
                <p style={{ margin: 0 }}>Second row of content.</p>
              </ConsoleCard.Content>
            </Card>
            <ConsoleCard.Root id="gallery-console-root">
              <ConsoleCard.Header title="ConsoleCard.Root (anchor id kept)" />
              <ConsoleCard.Content>
                <p style={{ margin: 0 }}>Only content.</p>
              </ConsoleCard.Content>
            </ConsoleCard.Root>
            <DangerZone>
              <h3 className="card-title">Danger zone</h3>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                A flat red-ruled panel, not a framed card.
              </p>
            </DangerZone>
            <Box style={{ padding: 16 }}>Box: a plain stepped container.</Box>
            <StatTiles>
              <StatTile
                icon={<CheckCircleIcon weight="bold" />}
                label="To record"
                value="5"
                of="have an account"
              />
              <StatTile
                icon={<UsersIcon weight="bold" />}
                label="Members"
                value="128"
                sub="Since August"
              />
              <StatTile label="Plain" value="42" />
            </StatTiles>
          </div>
        )}
      </Group>

      <Group title="Feedback">
        {() => (
          <div className="col" style={{ gap: 14 }}>
            <Callout title="Check-in opens at 5:55.">
              Scan the QR on the projector or use the link in Discord.
            </Callout>
            <Callout tone="success" title="You're checked in.">
              Thanks for coming to Merge Monday.
            </Callout>
            <Callout tone="warning" title="Verify your UGA email">
              to appear in the directory.
            </Callout>
            <Callout tone="critical" alert title="Sign-in failed.">
              GitHub didn&apos;t return an email address (role=alert).
            </Callout>
            <Callout>
              A notice with no title. <a href="#feedback">With a link.</a>
            </Callout>
            <div className="spec" style={{ alignItems: "flex-start" }}>
              <div className="col" style={{ flex: 1, minWidth: 160 }}>
                <Skeleton style={{ width: "70%" }} />
                <Skeleton />
                <Skeleton style={{ width: "50%" }} />
              </div>
            </div>
            <div className="col" style={{ gap: 12 }}>
              <ProgressBar value={0} max={10} />
              <ProgressBar value={6.2} max={10} fillColor="sky" />
              <ProgressBar value={10} max={10} fillColor="amber" />
              {EVENT_CATEGORIES.map((k) => (
                <ProgressBar key={k} value={55} max={100} kind={k} />
              ))}
            </div>
            <EmptyState
              title="No past events yet"
              description="Check back after Merge Monday."
            />
            <EmptyState title="Nothing here yet" image={false}>
              <Button size="sm">With an action, no mascot</Button>
            </EmptyState>
            <div className="spec" style={{ alignItems: "stretch" }}>
              <Separator />
            </div>
            <div className="spec" style={{ height: 40 }}>
              <span>Left</span>
              <Separator orientation="vertical" />
              <span>Right</span>
            </div>
          </div>
        )}
      </Group>

      <Group
        title="Page skeletons"
        intro="The route-level loading shapes in <code>Skeletons.tsx</code>: a static dithered stripe, no shimmer."
      >
        {() => (
          <div className="col" style={{ gap: 18 }}>
            <CardSkeleton rows={2} />
            <TableSkeleton rows={3} />
          </div>
        )}
      </Group>

      <Group
        title="Page head and band"
        intro="<code>PageHeader</code> over its generated scene (the brand art, then an event category by <code>kind</code>), and <code>Band</code> between two plain sections. The band's 24px edges overhang, so its parent must not clip."
        finishes={["cosmic"]}
      >
        {() => (
          <div className="col" style={{ gap: 18 }}>
            <PageHeader title="Community" description="Meet the pack.">
              <Button size="sm">Action</Button>
            </PageHeader>
            <PageHeader title="Merge Monday" kind="build" accent="cyan" />
            <PageHeader title="Legacy accent" accent="violet" />
            <div style={{ padding: "40px 0" }}>
              <p style={{ margin: 0 }}>A plain section above the band.</p>
              <Band as="div" style={{ margin: "40px 0", padding: "32px 24px" }}>
                <p style={{ margin: 0 }}>Inside a band.</p>
              </Band>
              <p style={{ margin: 0 }}>A plain section below the band.</p>
            </div>
          </div>
        )}
      </Group>
    </>
  );
}
