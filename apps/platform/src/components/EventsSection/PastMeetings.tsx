"use client";

import { useState } from "react";
import Link from "next/link";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { cn } from "~/lib/cn";
import { EVENT_TZ, formatEventDate } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import type { MeetingSummary } from "~/server/loaders/meetings";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";
import { Input } from "~/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "~/ui/table";
import { CANCELLED_LABEL, isCancelled, meetingCategory } from "./meetingView";

/**
 * The archive: the most recent nights that already happened, as a short list
 * in the aside (`events.html`, "Past meetings").
 *
 * The attendance count is the reason it earns a place. An officer typed
 * everything else on the events page; attendance is counted from check-ins the
 * platform holds itself, so it is the one number here nobody could have written
 * down. A cancelled night prints its status instead of a count: nobody checks
 * in to a meeting that did not happen, and a 0 would read as a night nobody
 * came to.
 *
 * Fetches and counts nothing: `attendanceCount` arrives on `MeetingSummary`
 * from a subquery in the loader.
 *
 * Below the list, "All past events" opens the whole archive in a dialog: a
 * table (date, meeting, workshops, attendance), a search box once the page in
 * hand has more than five rows, and older/newer paging.
 *
 * The page is cached and reads no request state, so `?past=<page>` cannot reach
 * the server (before the redesign the param was linked but never read either,
 * so every page showed page 1). The loader hands over the archive up to
 * `ARCHIVE_LIMIT` rows in one go and the dialog pages through them in client
 * state. The search filters the page in hand, the limit of a client-side filter
 * over a paged table.
 */

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: EVENT_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: EVENT_TZ,
});

const RECENT_COUNT = 8;
const ARCHIVE_PAGE_SIZE = 10;

export default function PastMeetings({
  meetings: archive,
}: {
  /** Most recent first: the recent few shown inline, all of them in the dialog. */
  meetings: MeetingSummary[];
}) {
  const meetings = archive.slice(0, RECENT_COUNT);
  return (
    <section id="past" aria-labelledby="past-meetings-heading">
      <div className="card-head">
        <h3 className="card-title" id="past-meetings-heading">
          Past meetings
        </h3>
      </div>
      {meetings.length === 0 ? (
        <p className="small muted">None yet this semester. Give it a Monday.</p>
      ) : (
        <div className="ev-past">
          {meetings.map((meeting) => {
            const cancelled = isCancelled(meeting);
            const where = locationLine(meeting.building, meeting.location);
            const detail = cancelled
              ? CANCELLED_LABEL
              : meeting.attendanceCount > 0
                ? `${meeting.attendanceCount} attended`
                : null;
            return (
              <Link
                key={meeting.id}
                href={`/events/${meeting.slug}`}
                data-kind={meetingCategory(meeting)}
              >
                <div className="d">
                  {MONTH.format(meeting.startsAt)}
                  <b>{DAY.format(meeting.startsAt)}</b>
                </div>
                <div>
                  <div className="t">{meetingTitle(meeting)}</div>
                  <div className="s">
                    {[where, detail].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {archive.length > 0 && <ArchiveDialog meetings={archive} />}
    </section>
  );
}

function ArchiveDialog({ meetings }: { meetings: MeetingSummary[] }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  const pageCount = Math.ceil(meetings.length / ARCHIVE_PAGE_SIZE);
  const rows = meetings.slice(
    (page - 1) * ARCHIVE_PAGE_SIZE,
    page * ARCHIVE_PAGE_SIZE,
  );
  const olderCount = Math.max(0, meetings.length - page * ARCHIVE_PAGE_SIZE);

  const needle = query.trim().toLowerCase();
  // Matched against the rendered title rather than `nameOverride`, so a search
  // finds the night by the words the page actually showed. Most have no
  // authored name at all, so searching the column would find almost nothing.
  const shown =
    needle === ""
      ? rows
      : rows.filter((meeting) =>
          meetingTitle(meeting).toLowerCase().includes(needle),
        );

  function goTo(next: number) {
    setPage(next);
    // The filter only sees the page in hand, so a stale query would hide the
    // new page's rows for no visible reason.
    setQuery("");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="ev-more-btn">
          All past events
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <div className="ev-archive-head">
          <DialogTitle>Past events</DialogTitle>
          <DialogDescription>
            Recent DevDogs events and attendance.
          </DialogDescription>
        </div>
        {/* Only once the page in hand is long enough to be worth searching.
            Below that a search box costs more room than the rows it filters. */}
        {rows.length > 5 && (
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this page…"
            aria-label="Search past meetings"
            className="ev-archive-search"
          />
        )}
        <div className="ev-archive-body">
          <Table caption="Past meetings, most recent first">
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th>Meeting</Th>
                <Th num>Workshops</Th>
                <Th num>Attendance</Th>
              </Tr>
            </THead>
            <TBody>
              {shown.map((meeting) => {
                // Cancelled nights stay in the archive on purpose: it is the
                // one place a member can learn that a night they were told
                // about did not happen.
                const cancelled = isCancelled(meeting);
                return (
                  <Tr key={meeting.id}>
                    <Td>
                      <time dateTime={meeting.startsAt.toISOString()}>
                        {formatEventDate(meeting.startsAt)}
                      </time>
                    </Td>
                    <Td strong wrap>
                      <Link
                        href={`/events/${meeting.slug}`}
                        className={cn(cancelled && "muted")}
                      >
                        {meetingTitle(meeting)}
                      </Link>
                      {cancelled && (
                        <span className="small muted"> {CANCELLED_LABEL}</span>
                      )}
                    </Td>
                    <Td num>{meeting.workshopCount}</Td>
                    <Td num>
                      {/* A dash, not the 0: nobody checks in to a meeting that
                          did not happen, and a 0 beside nights that drew forty
                          reads as a night nobody came to. */}
                      {cancelled ? (
                        <span aria-label="No attendance: this meeting was cancelled">
                          &mdash;
                        </span>
                      ) : (
                        meeting.attendanceCount
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
        {shown.length === 0 && (
          // About what the reader typed, not about the archive being empty.
          <p className="small muted">
            Nothing on this page matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {pageCount > 1 && (
          <div className="ev-archive-pager">
            {page > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => goTo(page - 1)}>
                Newer
              </Button>
            ) : (
              <span />
            )}
            <span className="small muted">
              Page {page} of {pageCount}
            </span>
            {olderCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goTo(page + 1)}
              >
                {olderCount === 1
                  ? "1 older meeting"
                  : `${olderCount} older meetings`}
              </Button>
            ) : (
              <span />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
