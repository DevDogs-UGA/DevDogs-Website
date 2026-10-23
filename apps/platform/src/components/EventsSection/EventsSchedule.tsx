"use client";

import { useState } from "react";
import {
  CalendarDotsIcon,
  CalendarPlusIcon,
  RowsIcon,
} from "@phosphor-icons/react/ssr";
import type { EventCategory } from "~/lib/eventKind";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import { Segmented } from "~/ui/segmented";
import MonthCalendar from "./MonthCalendar";
import PastMeetings from "./PastMeetings";
import ScheduleList, { ScheduleFilters } from "./ScheduleList";
import SubscribeToCalendar from "./SubscribeToCalendar";
import { meetingCategory } from "./meetingView";

interface Props {
  /** Every meeting in the window, ascending. */
  meetings: MeetingInRange[];
  past: MeetingSummary[];
  pastMoreCount: number;
  now: Date;
  today: { year: number; month: number; day: number } | null;
  bounds: {
    from: { year: number; month: number };
    to: { year: number; month: number };
  };
  feedUrl: string;
}

/**
 * The toolbar and the two views of the schedule. The view and the category
 * filter are local state: the page is cached and reads no request, so a URL
 * parameter could not choose between them on the server, and neither choice is
 * worth a cookie.
 */
export default function EventsSchedule({
  meetings,
  past,
  pastMoreCount,
  now,
  today,
  bounds,
  feedUrl,
}: Props) {
  const [view, setView] = useState<"list" | "month">("list");
  const [filter, setFilter] = useState<EventCategory | null>(null);

  const filtered =
    filter === null
      ? meetings
      : meetings.filter((meeting) => meetingCategory(meeting) === filter);
  // Bounded on `endsAt`, not `startsAt`: a meeting already in progress is still
  // the one somebody deciding whether to walk over cares about.
  const upcoming = meetings.filter((meeting) => meeting.endsAt >= now);
  const upcomingShown = filtered.filter((meeting) => meeting.endsAt >= now);

  const aside = (
    <div className="ev-stack">
      <SubscribeToCalendar feedUrl={feedUrl} />
      <PastMeetings meetings={past} moreCount={pastMoreCount} />
    </div>
  );

  return (
    <>
      <div className="ev-toolbar">
        <Segmented
          aria-label="View"
          value={view}
          onValueChange={(value) => setView(value as "list" | "month")}
          options={[
            {
              value: "list",
              label: (
                <>
                  <RowsIcon weight="bold" aria-hidden />
                  List
                </>
              ),
            },
            {
              value: "month",
              label: (
                <>
                  <CalendarDotsIcon weight="bold" aria-hidden />
                  Month
                </>
              ),
            },
          ]}
        />
        <ScheduleFilters
          meetings={view === "list" ? upcoming : meetings}
          active={filter}
          onChange={setFilter}
        />
        <div className="grow" />
        <a className="btn secondary sm" href="#calendar">
          <CalendarPlusIcon weight="bold" aria-hidden />
          Add to calendar
        </a>
      </div>

      {view === "list" ? (
        <div className="ev-layout">
          <ScheduleList
            meetings={upcomingShown}
            total={upcoming.length}
            now={now}
            today={today}
            onClearFilter={() => setFilter(null)}
          />
          <aside>{aside}</aside>
        </div>
      ) : (
        <MonthCalendar
          meetings={filtered}
          now={now}
          today={today}
          bounds={bounds}
          aside={aside}
        />
      )}
    </>
  );
}
