import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
} from "@phosphor-icons/react/ssr";

import { EVENT_CATEGORIES } from "~/lib/eventKind";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "~/ui/avatar";
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import { Chip } from "~/ui/chip";
import { DateTile } from "~/ui/date-tile";
import { Kbd } from "~/ui/kbd";
import { LiveDot } from "~/ui/live-dot";
import { Tag } from "~/ui/tag";
import { KIT_GROUPS } from "../groups";

const FINISHES = [
  { finish: "cosmic", label: "Cosmic · DevDogs" },
  { finish: "paper", label: "Paper · GDG on Campus" },
] as const;

const SPRITES = ["laptop", "rocket", "trophy", "hot_beverage", "light_bulb"];

const note = (title: string) =>
  KIT_GROUPS.find((g) => g.title === title)?.note ?? "";

const LABEL: Record<(typeof EVENT_CATEGORIES)[number], string> = {
  build: "Build",
  workshop: "Workshop",
  social: "Social",
  info: "Info",
  study: "Study",
  milestone: "Milestone",
};

function Group({
  title,
  children,
}: {
  title: string;
  children: (finish: (typeof FINISHES)[number]["finish"]) => React.ReactNode;
}) {
  return (
    <section className="grp" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2>{title}</h2>
      <p dangerouslySetInnerHTML={{ __html: note(title) }} />
      <div className="pair">
        {FINISHES.map(({ finish, label }) => (
          <div key={finish} className={`pane ${finish}`} data-label={label}>
            {children(finish)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every state of the live label and identity primitives, in both finishes. */
export default function LabelsSection() {
  return (
    <>
      <Group title="Chips, badges and tags">
        {() => (
          <>
            <div className="spec">
              {EVENT_CATEGORIES.map((k) => (
                <Chip key={k} kind={k}>
                  {LABEL[k]}
                </Chip>
              ))}
              <Chip>Default red</Chip>
              <Chip kind="build" outline dot>
                Next up
              </Chip>
            </div>
            <div className="spec">
              {EVENT_CATEGORIES.map((k) => (
                <Chip key={k} kind={k} outline>
                  {LABEL[k]}
                </Chip>
              ))}
              <Chip kind="social" dot>
                With dot
              </Chip>
            </div>
            <div className="spec">
              <div className="card" style={{ padding: 16 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Chip kind="workshop">In a card</Chip>
                  <Chip kind="workshop" outline dot>
                    Outline in a card
                  </Chip>
                </div>
              </div>
            </div>
            <div className="spec">
              <Badge variant="brand">Officer</Badge>
              <Badge variant="success">
                <CheckCircleIcon weight="bold" /> Verified
              </Badge>
              <Badge variant="warning">Pending</Badge>
              <Badge variant="danger">Revoked</Badge>
              <Badge variant="info">Beta</Badge>
              <Badge>Draft</Badge>
            </div>
            <div className="spec">
              <Tag>Next.js</Tag>
              <Tag>TypeScript</Tag>
              <Tag>Supabase</Tag>
              <Tag>Flutter</Tag>
              <Tag>@sloan</Tag>
            </div>
            <div className="spec">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
              <LiveDot>Live now</LiveDot>
            </div>
          </>
        )}
      </Group>

      <Group title="Event row">
        {() => (
          <div className="col" style={{ gap: 20 }}>
            <div
              className="card k glow tint event"
              data-kind="build"
              style={
                {
                  "--glow": "url(/cosmic/img/glow-build.png)",
                } as React.CSSProperties
              }
            >
              <DateTile kind="build" weekday="Mon" day={26} month="Oct" />
              <div>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <Chip kind="build">Build</Chip>
                  <Chip kind="build" outline dot>
                    Next up
                  </Chip>
                </div>
                <h3 className="title">Merge Monday</h3>
                <div className="meta">
                  <span>
                    <ClockIcon weight="bold" />
                    6–8 PM
                  </span>
                  <span>
                    <MapPinIcon weight="bold" />
                    DLW 124
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm">
                Details <ArrowRightIcon weight="bold" />
              </Button>
            </div>
            <div className="card event" data-kind="workshop">
              <DateTile kind="workshop" weekday="Wed" day={4} month="Nov" />
              <div>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <Chip kind="workshop">Workshop</Chip>
                </div>
                <h3 className="title">Supabase II: Editing Our App Schemas</h3>
                <div className="meta">
                  <span>
                    <ClockIcon weight="bold" />
                    6–7 PM
                  </span>
                  <span>
                    <MapPinIcon weight="bold" />
                    DLW 124
                  </span>
                </div>
              </div>
              <Button variant="outline">Details</Button>
            </div>
            <div className="spec">
              {EVENT_CATEGORIES.map((k) => (
                <DateTile
                  key={k}
                  kind={k}
                  weekday="Thu"
                  day={12}
                  month="Nov"
                  style={{ width: 84 }}
                />
              ))}
              <DateTile
                weekday="Fri"
                day={30}
                month="Jan"
                style={{ width: 84 }}
              />
            </div>
          </div>
        )}
      </Group>

      <Group title="Decor and identity">
        {(finish) => (
          <>
            <div className="spec">
              {SPRITES.map((n) =>
                finish === "cosmic" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={n}
                    className="sprite deco"
                    alt=""
                    src={`/cosmic/a/sprite/${n}.png`}
                    style={{ "--w": "64px" } as React.CSSProperties}
                  />
                ) : (
                  <span key={n} className="emoji-badge">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={`/cosmic/a/emoji/${n}.svg`} />
                  </span>
                ),
              )}
            </div>
            <div className="spec">
              <Avatar size="lg" kind="build">
                <AvatarFallback>SF</AvatarFallback>
              </Avatar>
              <Avatar size="md" kind="workshop">
                <AvatarFallback>AL</AvatarFallback>
              </Avatar>
              <Avatar kind="social">
                <AvatarFallback>RK</AvatarFallback>
              </Avatar>
              <Avatar size="sm" kind="info">
                <AvatarFallback>JM</AvatarFallback>
              </Avatar>
              <AvatarGroup>
                <Avatar kind="build">
                  <AvatarFallback>A</AvatarFallback>
                </Avatar>
                <Avatar kind="workshop">
                  <AvatarFallback>B</AvatarFallback>
                </Avatar>
                <Avatar kind="social">
                  <AvatarFallback>C</AvatarFallback>
                </Avatar>
                <AvatarGroupCount data-kind="study">+9</AvatarGroupCount>
              </AvatarGroup>
            </div>
            <div className="spec">
              <Avatar size="lg">
                <AvatarImage src="/cosmic/a/sprite/rocket.png" alt="Rocket" />
                <AvatarFallback>RK</AvatarFallback>
                <AvatarBadge />
              </Avatar>
              <Avatar size="md" kind="workshop">
                <AvatarFallback>
                  <UserIcon weight="bold" />
                </AvatarFallback>
                <AvatarBadge />
              </Avatar>
              <Avatar kind="social">
                <AvatarFallback>AL</AvatarFallback>
                <AvatarBadge />
              </Avatar>
              <Avatar size="sm" kind="info">
                <AvatarFallback>JM</AvatarFallback>
                <AvatarBadge />
              </Avatar>
              <Avatar>
                <AvatarImage src="/missing.png" alt="" />
                <AvatarFallback>FB</AvatarFallback>
              </Avatar>
            </div>
          </>
        )}
      </Group>
    </>
  );
}
