import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScrapeDb, type ScrapeDb } from "~/db/client";
import { meetings, offerings } from "~/db/schema";
import {
  InvariantViolationError,
  checkTermInvariants,
} from "~/scrape/invariants";
import {
  reconcileTerm,
  type TermToReconcile,
} from "~/scrape/parsers/reconcileTerm";
import type { Row } from "~/scrape/parsers/types";
import { RowStats } from "~/scrape/RowStats";
import { createTestDatabase, type TestDatabase } from "./harness";

/**
 * `reconcileTerm` and the scrape invariants against a real Postgres: the SQL is
 * the point. Fixed fake terms in the 9xxxxx range, seeded by `reconcileTerm`
 * itself (simulating "last run").
 */

let testDb: TestDatabase;
let db: ScrapeDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createScrapeDb(testDb.url, 3);
  sql = postgres(testDb.url, { max: 2, onnotice: () => undefined });
});

afterAll(async () => {
  await db?.$client.end({ timeout: 5 });
  await sql?.end({ timeout: 5 });
  await testDb?.drop();
});

const PART = "1";

function partOfTerm(academicPeriod: number) {
  return {
    academicPeriod,
    code: PART,
    description: "Full Term",
    classesBegin: "2026-01-01",
    dropAddEnds: "2026-01-08",
    censusDate: "2026-01-15",
    withdrawalDeadline: "2026-04-01",
    classesEnd: "2026-05-01",
  };
}

function row(opts: {
  period: number;
  crn: number;
  course?: string;
  time?: string;
  building?: string;
  status?: string;
}): Row {
  const course = opts.course ?? "RCTEST101";
  // A distinct course number per course: (subject, number) is unique.
  const number = course.replace(/\D/g, "");
  return {
    ACADEMIC_PERIOD: String(opts.period),
    "SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER": String(opts.crn),
    "SSBSECT.SSBSECT_PTRM_CODE": PART,
    "SCHEDULE_OFFERING.COURSE_IDENTIFICATION": course,
    "SCHEDULE_OFFERING.COURSE_NUMBER": number,
    "SCHEDULE_OFFERING.TITLE_LONG_DESC": "Reconcile Test Course",
    "SCHEDULE_OFFERING.TITLE_SHORT_DESC": "Reconcile Test",
    "SCHEDULE_OFFERING.MIN_CREDITS": "3",
    "SCHEDULE_OFFERING.MAX_CREDITS": "3",
    "SCHEDULE_OFFERING.MIN_BILLING": "3",
    "SCHEDULE_OFFERING.SUBJECT": "RCT",
    "SCHEDULE_OFFERING.SUBJECT_DESC": "Reconcile Test Subject",
    "SCHEDULE_OFFERING.COLLEGE_DESC": "Reconcile Test College",
    "SCHEDULE_OFFERING.SCHEDULE": "LEC",
    "SCHEDULE_OFFERING.CAMPUS": "ATH",
    "SCHEDULE_OFFERING.MAXIMUM_ENROLLMENT": "30",
    "SCHEDULE_OFFERING.ACTUAL_ENROLLMENT": "10",
    "SCHEDULE_OFFERING.SEATS_AVAILABLE": "20",
    "SCHEDULE_OFFERING.STATUS": opts.status ?? "A",
    "MEETING_TIME.MONDAY_IND": "Y",
    Time: opts.time ?? "10:00 am-10:50 am",
    Building: opts.building ?? "",
    "MEETING_TIME.BUILDING_DESC": opts.building ? `Building ${opts.building}` : "",
  };
}

function term(period: number, rows: Row[]): TermToReconcile {
  return {
    academicPeriod: period,
    description: `Test term ${period}`,
    partOfTermRows: [partOfTerm(period)],
    rows,
  };
}

/** `count` sections of one fake course in `period`. */
function sections(period: number, firstCrn: number, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const minute = String(i * 5).padStart(2, "0");
    return row({ period, crn: firstCrn + i, time: `09:${minute} am-10:${minute} am` });
  });
}

const meetingsOf = (period: number, crn: number) =>
  db
    .select()
    .from(meetings)
    .where(and(eq(meetings.academicPeriod, period), eq(meetings.offeringCrn, crn)));

describe("reconcileTerm", () => {
  const A = 900101;
  const B = 900102;
  const EMPTY = 900103;

  beforeAll(async () => {
    await reconcileTerm(
      term(A, [row({ period: A, crn: 9010001 }), row({ period: A, crn: 9010002, time: "11:00 am-11:50 am" })]),
      db,
      { invariants: "report" },
    );
    await reconcileTerm(
      term(B, [row({ period: B, crn: 9010001, course: "RCTEST102", time: "09:00 am-09:50 am" })]),
      db,
      { invariants: "report" },
    );
    await reconcileTerm(
      term(EMPTY, [row({ period: EMPTY, crn: 9010201 }), row({ period: EMPTY, crn: 9010202 })]),
      db,
      { invariants: "report" },
    );
  });

  it("touches only the reconciled term: cancels a vanished offering, keeps and adds others, replaces only this term's meetings, leaves other terms byte-identical", async () => {
    const beforeB = await db.select().from(offerings).where(eq(offerings.academicPeriod, B));
    const beforeBMeetings = await meetingsOf(B, 9010001);
    const beforeKeep = await meetingsOf(A, 9010001);
    const beforeDrop = await meetingsOf(A, 9010002);
    expect(beforeKeep).toHaveLength(1);
    expect(beforeDrop).toHaveLength(1);

    // This run: 9010002 vanished from the feed, 9010001's time changed,
    // 9010003 is new.
    const result = await reconcileTerm(
      term(A, [
        row({ period: A, crn: 9010001, time: "01:00 pm-01:50 pm" }),
        row({ period: A, crn: 9010003, time: "02:00 pm-02:50 pm" }),
      ]),
      db,
      { invariants: "report" },
    );

    expect(result).toMatchObject({
      academicPeriod: A,
      courseCount: 1,
      offeringCount: 2,
      meetingCount: 2,
      rowCount: 2,
      cancelledCount: 1,
    });

    const after = new Map(
      (await db.select().from(offerings).where(eq(offerings.academicPeriod, A))).map((o) => [o.crn, o]),
    );
    expect(after.get(9010001)?.cancelled).toBe(false);
    expect(after.get(9010003)?.cancelled).toBe(false);
    // Marked cancelled, not deleted.
    expect(after.get(9010002)?.cancelled).toBe(true);

    // Replaced, not accumulated.
    const keep = await meetingsOf(A, 9010001);
    expect(keep).toHaveLength(1);
    expect(keep[0]?.startTime).not.toBe(beforeKeep[0]?.startTime);
    expect(await meetingsOf(A, 9010003)).toHaveLength(1);
    // The vanished section keeps its meeting: saved plans still refer to it.
    expect(await meetingsOf(A, 9010002)).toEqual(beforeDrop);

    // Term B was never passed to this run.
    expect(await db.select().from(offerings).where(eq(offerings.academicPeriod, B))).toEqual(beforeB);
    expect(await meetingsOf(B, 9010001)).toEqual(beforeBMeetings);
  });

  it("cancels every offering when the feed is empty, without building an empty NOT IN", async () => {
    const result = await reconcileTerm(term(EMPTY, []), db, { invariants: "report" });
    expect(result).toMatchObject({ offeringCount: 0, meetingCount: 0, cancelledCount: 2 });
    const rows = await db.select().from(offerings).where(eq(offerings.academicPeriod, EMPTY));
    expect(rows).toHaveLength(2);
    expect(rows.every((o) => o.cancelled)).toBe(true);
    // ...and that is exactly what the section-count invariant is for.
    const failed = result.invariants.filter((i) => !i.ok).map((i) => i.name);
    expect(failed).toContain("sectionCountStable");
  });

  it("reads rows from an async stream as it does from a list", async () => {
    async function* stream(): AsyncGenerator<Row> {
      yield row({ period: 900104, crn: 9010401 });
      await Promise.resolve();
      yield row({ period: 900104, crn: 9010402 });
    }
    const result = await reconcileTerm(
      { ...term(900104, []), rows: stream() },
      db,
      { invariants: "report" },
    );
    expect(result.offeringCount).toBe(2);
  });
});

describe("scrape invariants, enforced", () => {
  const P = 900201;

  beforeAll(async () => {
    await reconcileTerm(term(P, sections(P, 9020001, 10)), db, { invariants: "report" });
  });

  it("passes every invariant for a clean rescrape", async () => {
    const result = await reconcileTerm(term(P, sections(P, 9020001, 10)), db);
    expect(result.invariants.every((i) => i.ok)).toBe(true);
    expect(result.invariants.map((i) => i.name)).toEqual([
      "termExists",
      "sectionCountStable",
      "noSectionWithoutMeetings",
      "timesWellFormed",
      "buildingsResolve",
      "cancelledFlagged",
    ]);
  });

  it("allows a 10% drop in sections, and writes it", async () => {
    const result = await reconcileTerm(term(P, sections(P, 9020001, 9)), db);
    expect(result.invariants.find((i) => i.name === "sectionCountStable")).toMatchObject({
      ok: true,
      detail: { previous: 10, current: 9, changePercent: -10 },
    });
    // Put it back for the next test.
    await reconcileTerm(term(P, sections(P, 9020001, 10)), db);
  });

  it("rolls the term back when the section count falls by more than 15%", async () => {
    const before = await db.select().from(offerings).where(eq(offerings.academicPeriod, P));

    const error = await reconcileTerm(term(P, sections(P, 9020001, 5)), db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvariantViolationError);
    expect((error as InvariantViolationError).failures.map((f) => f.name)).toEqual(["sectionCountStable"]);

    // Nothing was written: the term is as it was.
    const after = await db.select().from(offerings).where(eq(offerings.academicPeriod, P));
    expect(after).toEqual(before);
    expect(after.filter((o) => o.cancelled)).toHaveLength(0);
  });

  it("lets a named invariant be waived for one run, and says so", async () => {
    const result = await reconcileTerm(term(P, sections(P, 9020001, 5)), db, {
      skipInvariants: ["sectionCountStable"],
    });
    expect(result.invariants.find((i) => i.name === "sectionCountStable")).toMatchObject({
      ok: false,
      skipped: true,
    });
    expect(result.offeringCount).toBe(5);
  });

  it("rolls the term back on a time the parser cannot read", async () => {
    const feed = [...sections(P, 9020001, 5), row({ period: P, crn: 9020099, time: "sometime Tuesday" })];
    const error = await reconcileTerm(term(P, feed), db, {
      skipInvariants: ["sectionCountStable"],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvariantViolationError);
    expect((error as InvariantViolationError).failures).toEqual([
      expect.objectContaining({ name: "timesWellFormed", detail: expect.objectContaining({ unreadableTimesInFeed: 1 }) as unknown }),
    ]);
  });

  it("has a term-first-seen path: no baseline, passes with sections, fails with none", async () => {
    const fresh = 900202;
    const ok = await reconcileTerm(term(fresh, sections(fresh, 9020201, 3)), db);
    expect(ok.invariants.find((i) => i.name === "sectionCountStable")).toMatchObject({
      ok: true,
      detail: { baseline: false },
    });
    await expect(reconcileTerm(term(900203, []), db)).rejects.toBeInstanceOf(InvariantViolationError);
  });
});

describe("checkTermInvariants on a term that was damaged after the scrape", () => {
  const P = 900301;

  async function check(
    mutate: () => Promise<unknown>,
    startedAt = new Date(Date.now() - 60_000),
    activeAfter = 4,
  ) {
    await reconcileTerm(term(P, sections(P, 9030001, 4)), db, { invariants: "report" });
    await mutate();
    return db.transaction((tx) =>
      checkTermInvariants(tx, {
        academicPeriod: P,
        startedAt,
        previousActive: activeAfter,
        stats: new RowStats(),
        skip: new Set(),
      }),
    );
  }

  const failing = (results: { name: string; ok: boolean }[]) =>
    results.filter((r) => !r.ok).map((r) => r.name);

  it("passes on a clean term", async () => {
    expect(failing(await check(async () => undefined))).toEqual([]);
  });

  it("flags a section with no meeting", async () => {
    const results = await check(() =>
      sql`delete from schedule_builder.meetings where "academicPeriod" = ${P} and "offeringCrn" = 9030001`,
    );
    expect(failing(results)).toEqual(["noSectionWithoutMeetings"]);
    expect(results.find((r) => r.name === "noSectionWithoutMeetings")?.detail).toEqual({ sectionsWithoutMeetings: 1 });
  });

  it("does not count a cancelled section without meetings", async () => {
    const results = await check(
      async () => {
        await sql`update schedule_builder.offerings set cancelled = true where "academicPeriod" = ${P} and crn = 9030001`;
        await sql`delete from schedule_builder.meetings where "academicPeriod" = ${P} and "offeringCrn" = 9030001`;
      },
      undefined,
      3,
    );
    expect(failing(results)).toEqual([]);
  });

  it("flags a meeting that ends before it starts, and one with only a start", async () => {
    const results = await check(async () => {
      await sql`update schedule_builder.meetings set "startTime" = '11:00', "endTime" = '10:00' where "academicPeriod" = ${P} and "offeringCrn" = 9030001`;
      await sql`update schedule_builder.meetings set "endTime" = null where "academicPeriod" = ${P} and "offeringCrn" = 9030002`;
    });
    expect(failing(results)).toEqual(["timesWellFormed"]);
    expect(results.find((r) => r.name === "timesWellFormed")?.detail).toMatchObject({ inconsistentStoredMeetings: 2 });
  });

  it("flags a RESERVED meeting with no building", async () => {
    const results = await check(() =>
      sql`update schedule_builder.meetings set "locationStatus" = 'RESERVED', "buildingId" = null where "academicPeriod" = ${P} and "offeringCrn" = 9030001`,
    );
    expect(failing(results)).toEqual(["buildingsResolve"]);
  });

  it("flags an active section the scrape did not see this run", async () => {
    const results = await check(
      () =>
        sql`update schedule_builder.offerings set "lastSeenAt" = now() - interval '3 days' where "academicPeriod" = ${P} and crn = 9030001`,
      new Date(),
    );
    expect(failing(results)).toContain("cancelledFlagged");
  });

  it("flags a term with no row or no parts of term", async () => {
    const results = await db.transaction((tx) =>
      checkTermInvariants(tx, {
        academicPeriod: 999999,
        startedAt: new Date(),
        previousActive: 0,
        stats: new RowStats(),
        skip: new Set(),
      }),
    );
    expect(failing(results)).toContain("termExists");
  });
});

describe("building coverage in the report", () => {
  it("counts the term's meetings and buildings that have coordinates", async () => {
    const P = 900401;
    await sql`insert into schedule_builder.buildings (id, description, address, latitude, longitude)
              values (4001, 'Placed', null, 33.95, -83.37)`;
    const result = await reconcileTerm(
      term(P, [
        row({ period: P, crn: 9040001, building: "4001" }),
        row({ period: P, crn: 9040002, building: "4001" }),
        row({ period: P, crn: 9040003, building: "4002" }),
        row({ period: P, crn: 9040004, building: "TBA", time: "TBA" }),
      ]),
      db,
      { invariants: "report" },
    );
    expect(result.buildingCoverage).toEqual({
      buildings: 2,
      buildingsWithCoordinates: 1,
      meetingsInBuildings: 3,
      meetingsWithCoordinates: 2,
      meetingCoveragePercent: 66.7,
      buildingCoveragePercent: 50,
    });
    // The scrape does not touch coordinates it did not write.
    const [placed] = await sql<{ latitude: number }[]>`select latitude from schedule_builder.buildings where id = 4001`;
    expect(placed?.latitude).toBe(33.95);
  });
});
