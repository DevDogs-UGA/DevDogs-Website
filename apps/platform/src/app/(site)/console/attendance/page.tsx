import type { Metadata } from "next";
import { PresentationIcon, ProhibitIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import OpenDisplayLink from "~/components/AttendanceDisplay/OpenDisplayLink";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { tileOf } from "~/components/Console/meetings";
import {
  CATEGORY_LABEL,
  meetingCategory,
  timeRange,
} from "~/components/EventsSection/meetingView";
import { formatEventShortDate } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { getOfficerAttendanceMeetings } from "~/server/attendance/getOfficerMeeting";
import { requirePermission } from "~/server/auth/require";
import { PageHeading } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { DateTile } from "~/ui/date-tile";
import { EmptyState } from "~/ui/empty-state";
import { LiveDot } from "~/ui/live-dot";
import { ListRow } from "~/ui/list-row";
import Pagination from "~/ui/pagination";

export const metadata: Metadata = {
  title: "Meetings | Console | DevDogs",
  robots: { index: false },
};

const PATH = "/console/attendance";
const PAST_PAGE_SIZE = 12;

type Meeting = Awaited<ReturnType<typeof getOfficerAttendanceMeetings>>[number];

function Row({ meeting, past }: { meeting: Meeting; past?: boolean }) {
  const kind = meetingCategory(meeting);
  const off = meeting.cancelledAt !== null;
  return (
    <ListRow
      variant="meeting"
      kind={kind}
      past={past}
      off={off}
      href={`/console/attendance/${meeting.id}`}
      date={<DateTile kind={kind} {...tileOf(meeting.startsAt)} />}
      title={meetingTitle(meeting)}
      chip={<Chip kind={kind}>{CATEGORY_LABEL[kind]}</Chip>}
      meta={
        off
          ? "Canceled in the schedule · no check-in"
          : timeRange(meeting.startsAt, meeting.endsAt)
      }
      badges={
        off ? (
          <Badge variant="danger">
            <ProhibitIcon weight="bold" aria-hidden />
            Canceled in the schedule
          </Badge>
        ) : null
      }
    />
  );
}

export default async function AttendanceDisplaysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requirePermission(canUserManageAttendance);
  const [meetings, params] = await Promise.all([
    getOfficerAttendanceMeetings(),
    searchParams,
  ]);
  const now = new Date();

  const live = meetings.filter(
    (m) => m.cancelledAt === null && m.startsAt <= now && m.endsAt >= now,
  );
  const upcoming = meetings
    .filter((m) => m.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = meetings.filter((m) => m.endsAt < now && !live.includes(m));

  const rawPage =
    typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const totalPages = Math.max(1, Math.ceil(past.length / PAST_PAGE_SIZE));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage),
  );
  const pastShown = past.slice(
    (page - 1) * PAST_PAGE_SIZE,
    page * PAST_PAGE_SIZE,
  );

  return (
    <ConsoleShell current={PATH}>
      <PageHeading
        title="Meetings"
        description="Open a meeting's display to put the live QR and rotating code on the projector. Displays stay available for past and future meetings."
      />

      {live.map((meeting) => {
        const kind = meetingCategory(meeting);
        const title = meetingTitle(meeting);
        return (
          <Card
            as="section"
            key={meeting.id}
            kind={kind}
            className="con-tonight"
            aria-labelledby={`live-${meeting.id}`}
          >
            <DateTile kind={kind} {...tileOf(meeting.startsAt)} />
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span className="eyebrow k" style={{ margin: 0 }}>
                  Under way
                </span>
                <LiveDot>Happening now</LiveDot>
              </div>
              <h2 id={`live-${meeting.id}`}>{title}</h2>
              <div className="small muted" style={{ marginTop: 8 }}>
                {timeRange(meeting.startsAt, meeting.endsAt)}
              </div>
            </div>
            <div className="acts">
              <OpenDisplayLink
                href={`/console/attendance/${meeting.id}`}
                className="btn primary"
              >
                <PresentationIcon weight="bold" aria-hidden />
                Open display
                <span className="sr-only">
                  {" "}
                  (opens the projector in a new window)
                </span>
              </OpenDisplayLink>
              <Link
                className="btn secondary"
                href={`/console/attendance/${meeting.id}`}
              >
                Meeting page
              </Link>
            </div>
          </Card>
        );
      })}

      <div className="con-sect" id="upcoming">
        <h2>Upcoming</h2>
        {upcoming.length > 0 && (
          <span className="small muted">
            {formatEventShortDate(upcoming[0]!.startsAt)} –{" "}
            {formatEventShortDate(upcoming[upcoming.length - 1]!.startsAt)}
          </span>
        )}
      </div>
      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing upcoming"
          description="No future meetings are on the schedule."
        />
      ) : (
        <div>
          {upcoming.map((meeting) => (
            <Row key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}

      <div className="con-sect" id="past">
        <h2>Past meetings</h2>
        <span className="small muted">Newest first</span>
      </div>
      {past.length === 0 ? (
        <EmptyState
          title="No past meetings"
          description="Meetings that have ended appear here."
        />
      ) : (
        <>
          <div>
            {pastShown.map((meeting) => (
              <Row key={meeting.id} meeting={meeting} past />
            ))}
          </div>
          <div className="con-foot">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={past.length}
              label="meetings"
              buildHref={(n) =>
                n === 1 ? `${PATH}#past` : `${PATH}?page=${n}#past`
              }
            />
          </div>
        </>
      )}
    </ConsoleShell>
  );
}
