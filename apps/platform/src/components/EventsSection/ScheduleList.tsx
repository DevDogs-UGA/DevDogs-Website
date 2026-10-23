"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ClockIcon,
  MapPinIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import { EVENT_CATEGORIES, type EventCategory } from "~/lib/eventKind";
import { clubDay, EVENT_TZ } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import type { MeetingInRange } from "~/server/loaders/meetings";
import Badge from "~/ui/badge";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { DateTile } from "~/ui/date-tile";
import { EmptyState } from "~/ui/empty-state";
import LinkButton from "~/ui/link-button";
import { cn } from "~/lib/cn";
import {
  CANCELLED_LABEL,
  CATEGORY_LABEL,
  isCancelled,
  meetingCategory,
  timeRange,
} from "./meetingView";

/**
 * The upcoming nights, as a list (`events.html`): the next one as a lead card,
 * then the rest by month, each a date tile, chips, title, time and place.
 *
 * Fetches nothing. Every meeting here was already loaded by whoever renders the
 * page; the calendar draws the same rows, and a second query would be the same
 * data read twice at a different instant.
 */

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: EVENT_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: EVENT_TZ,
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: EVENT_TZ,
});
const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: EVENT_TZ,
});
const HOUR = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: EVENT_TZ,
});

/** The categories present in `meetings`, in the kit's order. */
export function presentCategories(
  meetings: readonly MeetingInRange[],
): EventCategory[] {
  const seen = new Set(meetings.map(meetingCategory));
  return EVENT_CATEGORIES.filter((category) => seen.has(category));
}

/**
 * Category filters, derived from what is actually in the schedule so a summer
 * with no socials offers no Social chip. With nothing chosen every chip reads
 * as on; choosing one isolates it, and choosing it again clears the choice.
 * Hidden when there is nothing to tell apart: one chip filters a list into
 * itself.
 */
export function ScheduleFilters({
  meetings,
  active,
  onChange,
}: {
  meetings: readonly MeetingInRange[];
  active: EventCategory | null;
  onChange: (filter: EventCategory | null) => void;
}) {
  const categories = presentCategories(meetings);
  if (categories.length <= 1) return null;

  return (
    <div className="ev-filters" role="group" aria-label="Filter the schedule">
      {categories.map((category) => {
        const on = active === null || active === category;
        return (
          <button
            key={category}
            type="button"
            data-kind={category}
            aria-pressed={active === category}
            className={cn("btn sm ghost", on && "on")}
            onClick={() => onChange(active === category ? null : category)}
          >
            <i className="dot" aria-hidden />
            {CATEGORY_LABEL[category]}
          </button>
        );
      })}
    </div>
  );
}

function sameDay(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number } | null,
): boolean {
  return (
    b !== null && a.year === b.year && a.month === b.month && a.day === b.day
  );
}

export default function ScheduleList({
  meetings,
  total,
  now,
  today,
  onClearFilter,
}: {
  /** The upcoming meetings after the filter, ascending. */
  meetings: MeetingInRange[];
  /** How many there were before the filter. Zero is a quiet schedule. */
  total: number;
  now: Date;
  today: { year: number; month: number; day: number } | null;
  onClearFilter: () => void;
}) {
  if (total === 0) return <EmptySchedule />;
  if (meetings.length === 0) return <NoMatches onClear={onClearFilter} />;

  const lead = meetings.find((meeting) => !isCancelled(meeting));
  const groups: { key: string; label: string; meetings: MeetingInRange[] }[] =
    [];
  for (const meeting of meetings) {
    const { year, month } = clubDay(meeting.startsAt);
    const key = `${year}-${month}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.meetings.push(meeting);
    else
      groups.push({
        key,
        label: MONTH_LONG.format(meeting.startsAt),
        meetings: [meeting],
      });
  }

  return (
    <div className="ev-list">
      <h2 className="sr-only">Upcoming meetings</h2>
      {lead && <LeadCard meeting={lead} now={now} today={today} />}
      {groups.map((group) => {
        const rows = group.meetings.filter((meeting) => meeting !== lead);
        const canceled = group.meetings.filter(isCancelled).length;
        const hasLead = lead !== undefined && group.meetings.includes(lead);
        return (
          <section key={group.key} aria-label={group.label}>
            <div className="ev-month">
              <h2>{group.label}</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {group.meetings.length}{" "}
                {group.meetings.length === 1 ? "meeting" : "meetings"}
                {hasLead && sameDay(clubDay(lead.startsAt), today)
                  ? ", including tonight"
                  : ""}
                {canceled > 0 ? ` · ${canceled} canceled` : ""}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="ev-rows">
                {rows.map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LeadCard({
  meeting,
  now,
  today,
}: {
  meeting: MeetingInRange;
  now: Date;
  today: { year: number; month: number; day: number } | null;
}) {
  const category = meetingCategory(meeting);
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  const isToday = sameDay(clubDay(meeting.startsAt), today);
  const evening = Number(HOUR.format(meeting.startsAt)) >= 17;
  const tag = happeningNow
    ? "Happening now"
    : isToday
      ? evening
        ? "Tonight"
        : "Today"
      : null;
  const where = locationLine(meeting.building, meeting.location);

  return (
    <div>
      <div className="eyebrow ev-lead-eyebrow">{tag ?? "Next up"}</div>
      <Card kind={category} glow className="ev-feature">
        <div className="event">
          <MeetingDate meeting={meeting} category={category} />
          <div>
            <div className="row ev-chips">
              <Chip kind={category}>{CATEGORY_LABEL[category]}</Chip>
              {tag && (
                <Chip kind={category} outline dot>
                  {tag}
                </Chip>
              )}
            </div>
            <h3 className="title">
              <Link href={`/events/${meeting.slug}`}>
                {meetingTitle(meeting, meeting.workshops)}
              </Link>
            </h3>
            <div className="meta">
              <span>
                <ClockIcon weight="bold" aria-hidden />
                {timeRange(meeting.startsAt, meeting.endsAt)}
              </span>
              <span>
                <MapPinIcon weight="bold" aria-hidden />
                {where ?? "Room to be announced"}
              </span>
            </div>
            {meeting.summary !== null && (
              <p className="lede">{meeting.summary}</p>
            )}
          </div>
          <div className="actions">
            <LinkButton
              href={`/events/${meeting.slug}`}
              variant="default"
              size="default"
            >
              Details <ArrowRightIcon weight="bold" />
            </LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MeetingDate({
  meeting,
  category,
}: {
  meeting: MeetingInRange;
  category: EventCategory;
}) {
  return (
    <DateTile
      kind={category}
      weekday={WEEKDAY.format(meeting.startsAt)}
      day={DAY.format(meeting.startsAt)}
      month={MONTH_SHORT.format(meeting.startsAt)}
    />
  );
}

export function MeetingRow({ meeting }: { meeting: MeetingInRange }) {
  const category = meetingCategory(meeting);
  const cancelled = isCancelled(meeting);
  // Every row prints its room, but only one *not* in the usual room earns a
  // badge saying so. A picked building answers it outright, and a null one
  // says nothing rather than guessing.
  const elsewhere = meeting.building !== null && meeting.building !== "DLW";
  const where = locationLine(meeting.building, meeting.location);

  return (
    <div
      className={cn("event", cancelled && "canceled")}
      data-kind={category}
      data-meeting-id={meeting.id}
    >
      <MeetingDate meeting={meeting} category={category} />
      <div>
        <div className="row ev-chips">
          <Chip kind={category} outline={cancelled}>
            {CATEGORY_LABEL[category]}
          </Chip>
          {cancelled && (
            <Badge variant="danger">
              <XCircleIcon weight="bold" aria-hidden />
              {CANCELLED_LABEL}
            </Badge>
          )}
          {elsewhere && !cancelled && (
            <Badge variant="warning">Not the usual room</Badge>
          )}
        </div>
        <h3 className="title">
          <Link href={`/events/${meeting.slug}`}>
            {meetingTitle(meeting, meeting.workshops)}
          </Link>
        </h3>
        <div className="meta">
          <span>
            <ClockIcon weight="bold" aria-hidden />
            {timeRange(meeting.startsAt, meeting.endsAt)}
          </span>
          <span>
            <MapPinIcon weight="bold" aria-hidden />
            {where ?? "Room to be announced"}
          </span>
          {cancelled && meeting.cancellationReason !== null && (
            <span>{meeting.cancellationReason}</span>
          )}
        </div>
      </div>
      {!cancelled && (
        <LinkButton
          href={`/events/${meeting.slug}`}
          variant="secondary"
          size="sm"
        >
          Details
        </LinkButton>
      )}
    </div>
  );
}

/**
 * The filter matched nothing, which is not the same state as an empty schedule
 * and must not borrow its copy: that one is a fact about the club, this one is
 * a fact about a control the reader is holding, and it hands back the way out.
 */
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="Nothing coming up matches that filter"
      description="Other kinds of meeting are still on the schedule."
    >
      <button type="button" className="btn secondary sm" onClick={onClear}>
        Show everything
      </button>
    </EmptyState>
  );
}

/**
 * Months of the year, not an error: the live state through every summer and
 * both breaks, so it reads as a status. An "unable to load events" framing would
 * send members to Discord to report a bug that is really just August.
 */
function EmptySchedule() {
  return (
    <EmptyState
      title="Nothing on the books yet"
      description="The next semester's schedule lands before it starts. Until then, anything one-off shows up on the Involvement Network first."
    >
      <a
        className="btn secondary sm"
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        DevDogs on the Involvement Network
      </a>
    </EmptyState>
  );
}
