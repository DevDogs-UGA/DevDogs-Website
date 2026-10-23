"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";
import { cn } from "~/lib/cn";
import { clubDateKey, clubDay, EVENT_TZ } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import type { MeetingInRange } from "~/server/loaders/meetings";
import Badge from "~/ui/badge";
import { DateTile } from "~/ui/date-tile";
import {
  CANCELLED_LABEL,
  CATEGORY_LABEL,
  isCancelled,
  meetingCategory,
  shortTime,
  timeRange,
} from "./meetingView";
import { MeetingRow, presentCategories } from "./ScheduleList";

/**
 * The month grid (`events-month.html`): seven columns, Monday first, a pill for
 * each meeting, the day that is tonight marked, and the selected day's meetings
 * written out underneath. On phones the grid gives way to an agenda of the
 * month, because a seven-column grid at 375px holds no readable names.
 *
 * Keyboard: the grid is a roving-tabindex `grid`; arrows move a day or a week,
 * Home and End jump to the row's ends, Page Up and Page Down change month, and
 * Enter or Space selects the day. Pills are ordinary links.
 *
 * Nothing here reads the clock: "today" is the cached `today` and `now` the
 * page handed down, so server and client agree and the tree stays cacheable.
 */

interface Month {
  year: number;
  /** 0-indexed, the shape `clubDay` returns. */
  month: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Formatted from a UTC-noon instant read back in UTC, so zones cannot slip a day. */
const MONTH_NAME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
});
const DAY_LONG = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const noon = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day, 12));
const monthIndex = (m: Month) => m.year * 12 + m.month;

function parseKey(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return noon(y, m - 1, d);
}

interface Cell {
  key: string;
  date: Date;
  inMonth: boolean;
}

/** The weeks of a month, padded to whole Monday-to-Sunday rows. */
function monthWeeks({ year, month }: Month): Cell[][] {
  const first = noon(year, month, 1);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + days) / 7);
  const rows: Cell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = noon(year, month, 1 - lead + w * 7 + d);
      row.push({
        key: keyOf(date),
        date,
        inMonth: date.getUTCMonth() === month,
      });
    }
    rows.push(row);
  }
  return rows;
}

export default function MonthCalendar({
  meetings,
  today,
  bounds,
  aside,
}: {
  /** Every meeting in the window, already filtered by category. */
  meetings: MeetingInRange[];
  now: Date;
  today: { year: number; month: number; day: number } | null;
  bounds: { from: Month; to: Month };
  /** Rendered beside the selected day (the calendar feed and past meetings). */
  aside: ReactNode;
}) {
  const todayKey = today
    ? `${today.year}-${pad(today.month + 1)}-${pad(today.day)}`
    : null;
  const initial: Month = today
    ? { year: today.year, month: today.month }
    : bounds.from;
  const [view, setView] = useState<Month>(initial);
  const [selected, setSelected] = useState<string | null>(todayKey);
  const [focusKey, setFocusKey] = useState<string>(
    todayKey ?? keyOf(noon(initial.year, initial.month, 1)),
  );
  const moved = useRef(false);

  const byDay = new Map<string, MeetingInRange[]>();
  for (const meeting of meetings) {
    const key = clubDateKey(meeting.startsAt);
    const list = byDay.get(key);
    if (list) list.push(meeting);
    else byDay.set(key, [meeting]);
  }

  const weeks = monthWeeks(view);
  const canPrev = monthIndex(view) > monthIndex(bounds.from);
  const canNext = monthIndex(view) < monthIndex(bounds.to);
  const monthKeys = new Set(weeks.flat().map((cell) => cell.key));
  const inView = (cell: Cell) => cell.inMonth;
  const monthMeetings = meetings.filter((meeting) => {
    const day = clubDay(meeting.startsAt);
    return day.year === view.year && day.month === view.month;
  });
  const focusable = monthKeys.has(focusKey)
    ? focusKey
    : (weeks[0]?.find(inView)?.key ?? weeks[0]?.[0]?.key ?? "");

  // After a keyboard move, put DOM focus on the cell that is now current. It
  // runs only for moves the keyboard made, never for a click or a render.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    document.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus();
  }, [focusKey, view]);

  function go(delta: number) {
    const next = { year: view.year, month: view.month + delta };
    const d = noon(next.year, next.month, 1);
    const clamped = { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    if (
      monthIndex(clamped) < monthIndex(bounds.from) ||
      monthIndex(clamped) > monthIndex(bounds.to)
    )
      return;
    setView(clamped);
    setFocusKey(keyOf(noon(clamped.year, clamped.month, 1)));
  }

  function goToday() {
    if (!today || todayKey === null) return;
    setView({ year: today.year, month: today.month });
    setSelected(todayKey);
    setFocusKey(todayKey);
  }

  function moveFocus(key: string) {
    const date = parseKey(key);
    const target = { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    if (
      monthIndex(target) < monthIndex(bounds.from) ||
      monthIndex(target) > monthIndex(bounds.to)
    )
      return;
    moved.current = true;
    setView(target);
    setFocusKey(key);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, cell: Cell) {
    const step = (days: number) => {
      const d = new Date(cell.date);
      d.setUTCDate(d.getUTCDate() + days);
      return keyOf(d);
    };
    const column = (cell.date.getUTCDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        moveFocus(step(-1));
        break;
      case "ArrowRight":
        moveFocus(step(1));
        break;
      case "ArrowUp":
        moveFocus(step(-7));
        break;
      case "ArrowDown":
        moveFocus(step(7));
        break;
      case "Home":
        moveFocus(step(-column));
        break;
      case "End":
        moveFocus(step(6 - column));
        break;
      case "PageUp": {
        const d = noon(
          cell.date.getUTCFullYear(),
          cell.date.getUTCMonth() - 1,
          1,
        );
        moveFocus(keyOf(d));
        break;
      }
      case "PageDown": {
        const d = noon(
          cell.date.getUTCFullYear(),
          cell.date.getUTCMonth() + 1,
          1,
        );
        moveFocus(keyOf(d));
        break;
      }
      case "Enter":
      case " ":
        if (event.target === event.currentTarget) setSelected(cell.key);
        else return;
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const selectedMeetings = selected ? (byDay.get(selected) ?? []) : [];
  const title = `${MONTH_NAME.format(noon(view.year, view.month, 1))} ${view.year}`;
  const legend = presentCategories(meetings);

  return (
    <div className="ev-monthview">
      <div className="ev-calbar">
        <button
          type="button"
          className="btn secondary sm icon"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => go(-1)}
        >
          <CaretLeftIcon weight="bold" />
        </button>
        <button
          type="button"
          className="btn secondary sm icon"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => go(1)}
        >
          <CaretRightIcon weight="bold" />
        </button>
        <h2 aria-live="polite">{title}</h2>
        {today && (
          <button type="button" className="btn ghost sm" onClick={goToday}>
            Today
          </button>
        )}
        <div className="grow" />
        <div className="legend">
          {legend.map((category) => (
            <span key={category} data-kind={category}>
              <i aria-hidden />
              {CATEGORY_LABEL[category]}
            </span>
          ))}
        </div>
      </div>

      <div className="card ev-cal">
        <div className="grid" role="grid" aria-label={title}>
          <div className="wk" role="row">
            {WEEKDAYS.map((day) => (
              <div key={day} role="columnheader">
                {day}
              </div>
            ))}
          </div>
          <div className="grid7">
            {weeks.map((row) => (
              <div className="wkrow" role="row" key={row[0]?.key}>
                {row.map((cell) => {
                  const list = byDay.get(cell.key) ?? [];
                  const isToday = cell.key === todayKey;
                  const past = todayKey !== null && cell.key < todayKey;
                  const day = cell.date.getUTCDate();
                  const label =
                    day === 1 || cell === weeks[0]?.[0]
                      ? `${MONTH_SHORT.format(cell.date)} ${day}`
                      : String(day);
                  return (
                    <div
                      key={cell.key}
                      role="gridcell"
                      data-day={cell.key}
                      tabIndex={cell.key === focusable ? 0 : -1}
                      aria-selected={selected === cell.key}
                      aria-label={DAY_LONG.format(cell.date)}
                      className={cn(
                        "cell",
                        !cell.inMonth && "out",
                        past && "past",
                        isToday && "today",
                        selected === cell.key && "sel",
                      )}
                      onClick={() => {
                        setSelected(cell.key);
                        setFocusKey(cell.key);
                      }}
                      onKeyDown={(event) => onKeyDown(event, cell)}
                      onFocus={() => setFocusKey(cell.key)}
                    >
                      <span className="n" aria-hidden>
                        {label}
                      </span>
                      {isToday && (
                        <Badge variant="info" className="today-b">
                          Tonight
                        </Badge>
                      )}
                      {list.map((meeting) => (
                        <Pill key={meeting.id} meeting={meeting} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ev-agenda" aria-label={`${title}, agenda`}>
        {monthMeetings.length === 0 ? (
          <p className="small muted">No meetings this month.</p>
        ) : (
          monthMeetings.map((meeting) => (
            <AgendaRow
              key={meeting.id}
              meeting={meeting}
              past={
                todayKey !== null && clubDateKey(meeting.startsAt) < todayKey
              }
            />
          ))
        )}
      </div>

      <div className="ev-below">
        <div className="selwrap">
          {selected && (
            <>
              <div
                className="selhead"
                data-kind={
                  selectedMeetings[0]
                    ? meetingCategory(selectedMeetings[0])
                    : undefined
                }
              >
                <h3>
                  {DAY_LONG.format(parseKey(selected))}
                  {selected === todayKey && (
                    <span className="small muted"> (today)</span>
                  )}
                </h3>
                <span className="rule" aria-hidden />
                <span className="small muted">
                  {selectedMeetings.length === 0
                    ? "No meetings"
                    : selectedMeetings.length === 1
                      ? "1 meeting"
                      : `${selectedMeetings.length} meetings`}
                </span>
              </div>
              <div className="ev-rows">
                {selectedMeetings.map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </>
          )}
          {!selected && (
            <p className="small muted">Pick a day to see its meetings.</p>
          )}
        </div>
        <div className="ev-aside">{aside}</div>
      </div>
    </div>
  );
}

function Pill({ meeting }: { meeting: MeetingInRange }) {
  const cancelled = isCancelled(meeting);
  const name = meetingTitle(meeting, meeting.workshops);
  return (
    <Link
      href={`/events/${meeting.slug}`}
      className={cn("pill", cancelled && "canceled")}
      data-kind={meetingCategory(meeting)}
      title={name}
    >
      <span className="t">
        {cancelled ? CANCELLED_LABEL : shortTime(meeting.startsAt)}
      </span>
      <span className="nm">{name}</span>
    </Link>
  );
}

const AGENDA_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: EVENT_TZ,
});
const AGENDA_DAY = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: EVENT_TZ,
});
const AGENDA_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: EVENT_TZ,
});

function AgendaRow({
  meeting,
  past,
}: {
  meeting: MeetingInRange;
  past: boolean;
}) {
  const category = meetingCategory(meeting);
  const cancelled = isCancelled(meeting);
  return (
    <Link
      href={`/events/${meeting.slug}`}
      className={cn("event", cancelled && "canceled", past && "past")}
      data-kind={category}
    >
      <DateTile
        kind={category}
        weekday={AGENDA_WEEKDAY.format(meeting.startsAt)}
        day={AGENDA_DAY.format(meeting.startsAt)}
        month={AGENDA_MONTH.format(meeting.startsAt)}
      />
      <div>
        <h3 className="title">{meetingTitle(meeting, meeting.workshops)}</h3>
        <div className="meta">
          {cancelled ? (
            <span>{CANCELLED_LABEL}</span>
          ) : (
            <span>{timeRange(meeting.startsAt, meeting.endsAt)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
