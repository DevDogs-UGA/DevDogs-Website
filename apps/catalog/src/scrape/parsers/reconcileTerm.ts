import { sql } from "drizzle-orm";
import type { ScrapeDb, ScrapeTx } from "~/db/client";
import type { partsOfTerm } from "~/db/schema";
import { terms } from "~/db/schema";
import {
  InvariantViolationError,
  buildingCoverageOf,
  checkTermInvariants,
  termCounts,
  type BuildingCoverage,
  type InvariantResult,
} from "../invariants";
import { RowStats } from "../RowStats";
import { BuildingCollector } from "./BuildingParser";
import { bulkUpsert } from "./bulkUpsert";
import { crnList } from "./crnList";
import { CampusCollector } from "./CampusParser";
import { CollegeCollector } from "./CollegeParser";
import { CourseCollector } from "./CourseParser";
import { DepartmentCollector } from "./DepartmentParser";
import { InstructorCollector } from "./InstructorParser";
import { MeetingCollector } from "./MeetingParser";
import { OfferingCollector } from "./OfferingParser";
import { upsertPartsOfTerm } from "./PartOfTermScraper";
import { ScheduleTypeCollector } from "./ScheduleTypeParser";
import { SubjectCollector } from "./SubjectParser";
import type { Row } from "./types";

/** One term to reconcile: its parts of term, and its registrar rows as a stream or a list. */
export type TermToReconcile = {
  academicPeriod: number;
  description: string;
  partOfTermRows: (typeof partsOfTerm.$inferInsert)[];
  rows: AsyncIterable<Row> | Iterable<Row>;
};

/**
 * Plain, JSON-serializable: this is returned from a Cloudflare Workflow step,
 * which persists its return value between steps, so it must not carry a class
 * instance, a Map, a Drizzle row, or anything else that doesn't survive a
 * `JSON.stringify`/`JSON.parse` round trip.
 */
export type TermReconcileResult = {
  academicPeriod: number;
  courseCount: number;
  offeringCount: number;
  meetingCount: number;
  /** Registrar rows read. */
  rowCount: number;
  /** Sections of the term stored as cancelled: not Active in the feed, or gone from it. */
  cancelledCount: number;
  invariants: InvariantResult[];
  buildingCoverage: BuildingCoverage;
};

export type ReconcileOptions = {
  /**
   * `enforce` (the default) rolls the term back when an invariant of severity
   * `error` fails. `report` computes them and keeps the data either way: for
   * fixtures and for backfills where a human has looked.
   */
  invariants?: "enforce" | "report";
  /** Invariants that may fail without blocking, by name. They are still reported, marked `skipped`. */
  skipInvariants?: readonly string[];
  /** When the run began; sections not seen since are the ones to flag cancelled. */
  startedAt?: Date;
  /** Overrides {@link TERM_TRANSACTION_LIMITS}; for tests that cannot wait fifteen seconds. */
  limits?: Partial<Record<keyof typeof TERM_TRANSACTION_LIMITS, string>>;
};

/**
 * The limits one term's transaction runs under.
 *
 * The Worker can die in the middle of a transaction ("exceeded memory limit"),
 * and the transaction it abandoned keeps its row locks until Postgres notices
 * the client is gone. Before these limits the retry then queued behind those
 * locks for the full 120 s statement_timeout, on every attempt, and the daily
 * scrape of 2027-02 ran out of retries on 2026-10-06. Now a retry gives up on a
 * lock after 15 s, and Postgres ends an abandoned transaction after 30 s idle,
 * so the retry after the workflow's backoff finds the rows free.
 */
export const TERM_TRANSACTION_LIMITS = {
  lockTimeout: "15s",
  idleInTransactionTimeout: "30s",
  statementTimeout: "120s",
} as const;

/**
 * Applies the limits to the transaction `tx` (`set_config(..., true)`, so they
 * end with it and never reach a pooled connection's next user).
 */
export async function applyTermLimits(
  tx: ScrapeTx,
  limits: Record<keyof typeof TERM_TRANSACTION_LIMITS, string> = {
    ...TERM_TRANSACTION_LIMITS,
  },
): Promise<void> {
  await tx.execute(
    sql`select set_config('lock_timeout', ${limits.lockTimeout}, true),
               set_config('idle_in_transaction_session_timeout', ${limits.idleInTransactionTimeout}, true),
               set_config('statement_timeout', ${limits.statementTimeout}, true)`,
  );
}

/**
 * Reads every row of a term into the collectors, one at a time. What is kept is
 * the collectors' compact records, deduplicated by natural key, never the
 * rows; see `csv.ts` for why that matters.
 */
async function collect(rows: TermToReconcile["rows"]) {
  const subjects = new SubjectCollector();
  const colleges = new CollegeCollector();
  const departments = new DepartmentCollector();
  const campuses = new CampusCollector();
  const scheduleTypes = new ScheduleTypeCollector();
  const instructors = new InstructorCollector();
  const buildings = new BuildingCollector();
  const courses = new CourseCollector();
  const offeringCollector = new OfferingCollector();
  const meetingCollector = new MeetingCollector();
  const stats = new RowStats();

  for await (const row of rows) {
    stats.collect(row);
    subjects.collect(row);
    colleges.collect(row);
    departments.collect(row);
    campuses.collect(row);
    scheduleTypes.collect(row);
    instructors.collect(row);
    buildings.collect(row);
    courses.collect(row);
    offeringCollector.collect(row);
    meetingCollector.collect(row);
  }

  return {
    subjects,
    colleges,
    departments,
    campuses,
    scheduleTypes,
    instructors,
    buildings,
    courses,
    offeringCollector,
    meetingCollector,
    stats,
  };
}

/**
 * Reconciles ONE term's registrar rows against the current schema, entirely
 * inside its own transaction.
 *
 * Scoped to a single term for two reasons: (1) a DB failure on one term (a
 * bad row, a constraint violation) must not roll back or block every other
 * term in the same scrape run; (2) it lets every collector, most pointedly
 * `MeetingCollector`, which has no natural key, replace only this term's rows
 * instead of every term's.
 *
 * The feed is read and collected BEFORE the transaction opens, so the
 * transaction (and its locks) lasts as long as the writes, not the download.
 *
 * `partsOfTerm` is upserted before `offerings`: `offerings` carries a
 * composite FK to `(academicPeriod, partOfTerm)`, so the parent row must
 * exist first within the same transaction.
 */
export async function reconcileTerm(
  term: TermToReconcile,
  database: ScrapeDb,
  options: ReconcileOptions = {},
): Promise<TermReconcileResult> {
  const startedAt = options.startedAt ?? new Date();
  const c = await collect(term.rows);

  return database.transaction(async (tx) => {
    await applyTermLimits(tx, {
      ...TERM_TRANSACTION_LIMITS,
      ...options.limits,
    });

    // What the term looked like before this run, for the section-count check.
    const before = await tx.execute<{ active: string }>(
      sql`select count(*) as active from schedule_builder.offerings
          where "academicPeriod" = ${term.academicPeriod} and not cancelled`,
    );
    const previousActive = Number(before[0]?.active ?? 0);

    await bulkUpsert(tx, terms, [
      { academicPeriod: term.academicPeriod, description: term.description },
    ]);
    await upsertPartsOfTerm(tx, term.partOfTermRows);
    const knownParts = new Set(
      (
        await tx.execute<{ code: string }>(
          sql`select code from schedule_builder."partsOfTerm" where "academicPeriod" = ${term.academicPeriod}`,
        )
      ).map((r) => r.code),
    );

    const [
      subjectIdMap,
      collegeIdMap,
      campusIdMap,
      scheduleTypeIdMap,
      instructorIdMap,
    ] = await Promise.all([
      c.subjects.flush(tx),
      c.colleges.flush(tx),
      c.campuses.flush(tx),
      c.scheduleTypes.flush(tx),
      c.instructors.flush(tx),
      c.buildings.flush(tx),
    ]);

    const departmentIdMap = await c.departments.flush(tx, collegeIdMap);
    const courseIdMap = await c.courses.flush(
      tx,
      subjectIdMap,
      collegeIdMap,
      departmentIdMap,
    );
    const validCrns = await c.offeringCollector.flush(
      tx,
      courseIdMap,
      instructorIdMap,
      scheduleTypeIdMap,
      campusIdMap,
      knownParts,
    );
    const meetingCount = await c.meetingCollector.flush(
      tx,
      term.academicPeriod,
      validCrns,
    );

    // Anything that used to be in this term's feed but isn't anymore is
    // cancelled, not deleted: past enrollment and saved plans still reference
    // the CRN. An empty `validCrns`, where every offering vanished from this
    // term's feed, cancels the whole academic period outright.
    if (validCrns.size > 0) {
      await tx.execute(
        sql`update schedule_builder.offerings set cancelled = true
            where "academicPeriod" = ${term.academicPeriod}
              and crn not in ${crnList(validCrns)}`,
      );
    } else {
      await tx.execute(
        sql`update schedule_builder.offerings set cancelled = true
            where "academicPeriod" = ${term.academicPeriod}`,
      );
    }

    const skip = new Set(options.skipInvariants ?? []);
    const invariants = await checkTermInvariants(tx, {
      academicPeriod: term.academicPeriod,
      startedAt,
      previousActive,
      stats: c.stats,
      unknownParts: c.offeringCollector.sectionsInUnknownParts,
      skip,
    });
    const blocking = invariants.filter(
      (i) => i.severity === "error" && !i.ok && !i.skipped,
    );
    if (blocking.length > 0 && options.invariants !== "report") {
      throw new InvariantViolationError(term.academicPeriod, blocking);
    }

    const counts = await termCounts(tx, term.academicPeriod);
    return {
      academicPeriod: term.academicPeriod,
      courseCount: courseIdMap.size,
      offeringCount: validCrns.size,
      meetingCount,
      rowCount: c.stats.rows,
      cancelledCount: counts.cancelled,
      invariants,
      buildingCoverage: await buildingCoverageOf(tx, term.academicPeriod),
    };
  });
}
