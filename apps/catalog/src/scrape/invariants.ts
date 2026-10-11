import { sql } from "drizzle-orm";
import type { ScrapeTx } from "~/db/client";
import type { RowStats } from "./RowStats";

/**
 * The scrape invariants: what must be true of a term after a scrape for the
 * catalog to be trusted, checked inside the term's own transaction, so a term
 * that fails is rolled back instead of published.
 *
 * Reported through the job heartbeat: the heartbeat row
 * (`platform."jobHeartbeats"`, job `schedule-builder-scrape`) is written only
 * when every term of the run passed, so a scrape that violates one stops the
 * heartbeat, the platform's daily-jobs check goes overdue, and Sentry alerts.
 * The full per-term report is stored in `uga."scrapeRuns"`.
 */

export type InvariantSeverity = "error" | "info";

export type InvariantResult = {
  name: string;
  ok: boolean;
  /** `error` blocks the term (and the heartbeat); `info` is only reported. */
  severity: InvariantSeverity;
  /** The failure was waived by the run's `skipInvariants`. Still reported. */
  skipped?: boolean;
  detail: Record<string, number | string | boolean | null>;
};

export const INVARIANT_NAMES = [
  "termExists",
  "sectionCountStable",
  "noSectionWithoutMeetings",
  "timesWellFormed",
  "buildingsResolve",
  "cancelledFlagged",
] as const;

/** How far the active section count may move between two runs: ±15%. */
export const SECTION_COUNT_TOLERANCE = 0.15;

export class InvariantViolationError extends Error {
  override readonly name = "InvariantViolationError";
  constructor(
    readonly academicPeriod: number,
    readonly failures: readonly InvariantResult[],
  ) {
    super(
      `Scrape invariants failed for ${academicPeriod}, term not written: ` +
        failures
          .map((f) => `${f.name} ${JSON.stringify(f.detail)}`)
          .join("; "),
    );
  }
}

/**
 * The section-count check, on its own so its arithmetic is unit-tested. With no
 * previous sections (a term's first scrape) there is nothing to compare, so
 * it passes and says so.
 */
export function sectionCountStable(
  previous: number,
  current: number,
  tolerance = SECTION_COUNT_TOLERANCE,
): InvariantResult {
  if (previous === 0) {
    return {
      name: "sectionCountStable",
      ok: current > 0,
      severity: "error",
      detail: { previous, current, baseline: false },
    };
  }
  const change = (current - previous) / previous;
  return {
    name: "sectionCountStable",
    ok: Math.abs(change) <= tolerance,
    severity: "error",
    detail: {
      previous,
      current,
      baseline: true,
      changePercent: Math.round(change * 1000) / 10,
      tolerancePercent: tolerance * 100,
    },
  };
}

type CheckInput = {
  academicPeriod: number;
  /** When the run began: every section seen since has `lastSeenAt` at or after it. */
  startedAt: Date;
  /** Active sections in the term before this run wrote anything. */
  previousActive: number;
  stats: RowStats;
  skip: ReadonlySet<string>;
};

/**
 * Runs every invariant for one term, inside its transaction after the writes.
 *
 * | name | holds when |
 * |---|---|
 * | `termExists` | the term has its `terms` row and at least one part of term |
 * | `sectionCountStable` | active sections moved at most 15% since the last run |
 * | `noSectionWithoutMeetings` | every active section has a meeting row (TBA and online ones too: the registrar lists them with a `TBA` time or `NCRR` building) |
 * | `timesWellFormed` | the feed had no unreadable time, and every stored meeting has both times or neither, start before end |
 * | `buildingsResolve` | every meeting's building exists, and none is `RESERVED` without one |
 * | `cancelledFlagged` | every section missing from the feed is flagged cancelled |
 *
 * The scrape stores a section the feed no longer lists as cancelled and keeps
 * its meetings (saved plans reference it), so `cancelledFlagged` is the check
 * that the cancel pass ran over the whole term.
 */
export async function checkTermInvariants(
  tx: ScrapeTx,
  input: CheckInput,
): Promise<InvariantResult[]> {
  const { academicPeriod: ap, startedAt, previousActive, stats, skip } = input;
  const rows = await tx.execute<Record<string, string | number>>(sql`
    select
      (select count(*) from schedule_builder.terms where "academicPeriod" = ${ap}) as terms,
      (select count(*) from schedule_builder."partsOfTerm" where "academicPeriod" = ${ap}) as parts,
      (select count(*) from schedule_builder.offerings
        where "academicPeriod" = ${ap} and not cancelled) as active,
      (select count(*) from schedule_builder.offerings o
        where o."academicPeriod" = ${ap} and not o.cancelled
          and not exists (select 1 from schedule_builder.meetings m
                          where m."academicPeriod" = o."academicPeriod" and m."offeringCrn" = o.crn)) as "withoutMeetings",
      (select count(*) from schedule_builder.meetings m
        where m."academicPeriod" = ${ap}
          and ((m."startTime" is null) <> (m."endTime" is null)
               or m."startTime" >= m."endTime")) as "badTimes",
      (select count(*) from schedule_builder.meetings m
        left join schedule_builder.buildings b on b.id = m."buildingId"
        where m."academicPeriod" = ${ap} and m."buildingId" is not null and b.id is null) as "danglingBuildings",
      (select count(*) from schedule_builder.meetings m
        where m."academicPeriod" = ${ap}
          and m."locationStatus" = 'RESERVED' and m."buildingId" is null) as "reservedWithoutBuilding",
      (select count(*) from schedule_builder.offerings o
        where o."academicPeriod" = ${ap} and not o.cancelled
          and o."lastSeenAt" < (${startedAt.toISOString()}::timestamptz at time zone 'UTC')) as unflagged
  `);
  const r = rows[0] ?? {};
  const n = (key: string) => Number(r[key] ?? 0);

  const results: InvariantResult[] = [
    {
      name: "termExists",
      ok: n("terms") === 1 && n("parts") > 0,
      severity: "error",
      detail: { terms: n("terms"), partsOfTerm: n("parts") },
    },
    sectionCountStable(previousActive, n("active")),
    {
      name: "noSectionWithoutMeetings",
      ok: n("withoutMeetings") === 0,
      severity: "error",
      detail: { sectionsWithoutMeetings: n("withoutMeetings") },
    },
    {
      name: "timesWellFormed",
      ok: stats.malformedTimes === 0 && n("badTimes") === 0,
      severity: "error",
      detail: {
        unreadableTimesInFeed: stats.malformedTimes,
        inconsistentStoredMeetings: n("badTimes"),
      },
    },
    {
      name: "buildingsResolve",
      ok:
        n("danglingBuildings") === 0 &&
        n("reservedWithoutBuilding") === 0 &&
        stats.unresolvableBuildings === 0,
      severity: "error",
      detail: {
        danglingBuildingIds: n("danglingBuildings"),
        reservedWithoutBuilding: n("reservedWithoutBuilding"),
        unresolvableBuildingsInFeed: stats.unresolvableBuildings,
      },
    },
    {
      name: "cancelledFlagged",
      ok: n("unflagged") === 0,
      severity: "error",
      detail: { activeSectionsMissingFromFeed: n("unflagged") },
    },
  ];

  return results.map((result) =>
    !result.ok && skip.has(result.name) ? { ...result, skipped: true } : result,
  );
}

export type BuildingCoverage = {
  /** Distinct buildings that meetings in the term use. */
  buildings: number;
  /** Of those, how many have coordinates. */
  buildingsWithCoordinates: number;
  /** Meetings in a numbered building. */
  meetingsInBuildings: number;
  /** Of those, how many are in a building with coordinates. */
  meetingsWithCoordinates: number;
  /** `meetingsWithCoordinates / meetingsInBuildings`, as a percentage to one decimal; null with no meetings. */
  meetingCoveragePercent: number | null;
  buildingCoveragePercent: number | null;
};

/** How much of the term's meetings the building dataset can place on a map. Reported, never blocking. */
export async function buildingCoverageOf(
  tx: ScrapeTx,
  academicPeriod: number,
): Promise<BuildingCoverage> {
  const rows = await tx.execute<Record<string, string>>(sql`
    select
      count(distinct m."buildingId") as buildings,
      count(distinct m."buildingId") filter (where b.latitude is not null and b.longitude is not null) as "buildingsWithCoordinates",
      count(*) as "meetingsInBuildings",
      count(*) filter (where b.latitude is not null and b.longitude is not null) as "meetingsWithCoordinates"
    from schedule_builder.meetings m
    join schedule_builder.buildings b on b.id = m."buildingId"
    where m."academicPeriod" = ${academicPeriod}
  `);
  const r = rows[0] ?? {};
  const buildings = Number(r.buildings ?? 0);
  const withCoords = Number(r.buildingsWithCoordinates ?? 0);
  const meetingsIn = Number(r.meetingsInBuildings ?? 0);
  const meetingsWith = Number(r.meetingsWithCoordinates ?? 0);
  const pct = (part: number, whole: number) =>
    whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
  return {
    buildings,
    buildingsWithCoordinates: withCoords,
    meetingsInBuildings: meetingsIn,
    meetingsWithCoordinates: meetingsWith,
    meetingCoveragePercent: pct(meetingsWith, meetingsIn),
    buildingCoveragePercent: pct(withCoords, buildings),
  };
}

/** Section counts for a term, read after the writes. */
export async function termCounts(tx: ScrapeTx, academicPeriod: number) {
  const rows = await tx.execute<Record<string, string>>(sql`
    select count(*) filter (where not cancelled) as active,
           count(*) filter (where cancelled) as cancelled
    from schedule_builder.offerings where "academicPeriod" = ${academicPeriod}
  `);
  return {
    active: Number(rows[0]?.active ?? 0),
    cancelled: Number(rows[0]?.cancelled ?? 0),
  };
}
