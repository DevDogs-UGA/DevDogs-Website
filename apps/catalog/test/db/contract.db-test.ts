import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleApiRequest, type ApiDeps, type Limiter } from "~/api/router";
import { createScrapeDb, type ScrapeDb } from "~/db/client";
import { withCatalogReader } from "~/db/reader";
import { reconcileTerm } from "~/scrape/parsers/reconcileTerm";
import type { Row } from "~/scrape/parsers/types";
import { responseValidator } from "../spec";
import { createTestDatabase, type TestDatabase } from "./harness";

/**
 * The contract: every endpoint, answering from a real database through the real
 * router and the real read-only role, and every body validated against the
 * schema in openapi/catalog.yaml. A field the spec does not describe, a type it
 * does not allow, or a missing one fails here.
 *
 * test/live/contract.live-test.ts runs the same checks against a deployed
 * catalog.
 */

const SPRING = 202702;
const FALL = 202608;
const BASE = "https://api-staging.devdogsuga.org/catalog/v1";

let testDb: TestDatabase;
let writer: ScrapeDb;
let sql: postgres.Sql;
const validator = responseValidator();

type SectionSpec = {
  crn: number;
  course: string;
  title: string;
  subject?: string;
  subjectDesc?: string;
  period: number;
  status?: string;
  meetings?: { days: string; time: string; building: string; room?: string }[];
  honors?: boolean;
  instructor?: [string, string];
};

function rowsOf(section: SectionSpec): Row[] {
  const subject = section.subject ?? section.course.replace(/\d+$/, "");
  const number = section.course.replace(/\D/g, "");
  const meetings = section.meetings ?? [{ days: "MW", time: "10:00 am-10:50 am", building: "" }];
  return meetings.map((m) => ({
    ACADEMIC_PERIOD: String(section.period),
    "SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER": String(section.crn),
    "SSBSECT.SSBSECT_PTRM_CODE": "1",
    "SCHEDULE_OFFERING.COURSE_IDENTIFICATION": section.course,
    "SCHEDULE_OFFERING.COURSE_NUMBER": number,
    "SCHEDULE_OFFERING.TITLE_LONG_DESC": section.title,
    "SCHEDULE_OFFERING.TITLE_SHORT_DESC": section.title.slice(0, 12),
    "SCHEDULE_OFFERING.MIN_CREDITS": "3",
    "SCHEDULE_OFFERING.MAX_CREDITS": "4",
    "SCHEDULE_OFFERING.MIN_BILLING": "3",
    "SCHEDULE_OFFERING.SUBJECT": subject,
    "SCHEDULE_OFFERING.SUBJECT_DESC": section.subjectDesc ?? `${subject} Studies`,
    "SCHEDULE_OFFERING.COLLEGE_DESC": "Franklin College",
    "SCHEDULE_OFFERING.DEPARTMENT_DESC": `${subject} Department`,
    "SCHEDULE_OFFERING.SCHEDULE": "LEC",
    "SCHEDULE_OFFERING.SCHEDULE_DESC": "Lecture",
    "SCHEDULE_OFFERING.CAMPUS": "ATH",
    "SCHEDULE_OFFERING.CAMPUS_DESC": "Athens",
    "SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_FIRST_NAME": section.instructor?.[0] ?? "",
    "SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_LAST_NAME": section.instructor?.[1] ?? "",
    "SCHEDULE_OFFERING.MAXIMUM_ENROLLMENT": "30",
    "SCHEDULE_OFFERING.ACTUAL_ENROLLMENT": "10",
    "SCHEDULE_OFFERING.SEATS_AVAILABLE": "20",
    "SCHEDULE_OFFERING.STATUS": section.status ?? "A",
    ...(section.honors ? { Has_Honors: "HONORS" } : {}),
    "MEETING_TIME.MONDAY_IND": m.days.includes("M") ? "Y" : "N",
    "MEETING_TIME.WEDNESDAY_IND": m.days.includes("W") ? "Y" : "N",
    "MEETING_TIME.FRIDAY_IND": m.days.includes("F") ? "Y" : "N",
    "MEETING_TIME.START_DATE": "01/11/2027",
    "MEETING_TIME.END_DATE": "05/04/2027",
    Time: m.time,
    Building: m.building,
    "MEETING_TIME.BUILDING_DESC": m.building && m.building !== "NCRR" ? `Building ${m.building}` : "",
    Room: m.room ?? "",
  }));
}

const SECTIONS: SectionSpec[] = [
  {
    crn: 20001,
    course: "CSCI1301",
    title: "Introduction to Programming",
    subjectDesc: "Computer Science",
    period: SPRING,
    instructor: ["Jane", "Doe"],
    meetings: [
      { days: "MW", time: "09:30 am-10:45 am", building: "0024", room: "101" },
      { days: "F", time: "09:30 am-10:20 am", building: "0024", room: "101" },
    ],
  },
  { crn: 20002, course: "CSCI1301", title: "Introduction to Programming", subjectDesc: "Computer Science", period: SPRING, instructor: ["Jane", "Doe"] },
  { crn: 20003, course: "CSCI1301", title: "Introduction to Programming", subjectDesc: "Computer Science", period: SPRING, status: "C" },
  { crn: 20004, course: "CSCI1302", title: "Software Development", subjectDesc: "Computer Science", period: SPRING },
  {
    crn: 20010,
    course: "MATH2250",
    title: "Calculus I",
    subjectDesc: "Mathematics",
    period: SPRING,
    honors: true,
    meetings: [{ days: "MW", time: "11:00 am-11:50 am", building: "NCRR" }],
  },
  // Every section cancelled: the course exists, but it is not on offer.
  { crn: 20020, course: "HIST1111", title: "Cancelled History", subjectDesc: "History", period: SPRING, status: "C" },
  { crn: 20030, course: "CSCI1301", title: "Introduction to Programming", subjectDesc: "Computer Science", period: FALL },
  { crn: 20031, course: "ENGL1101", title: "Composition", subjectDesc: "English", period: FALL },
];

function partOfTerm(academicPeriod: number) {
  return {
    academicPeriod,
    code: "1",
    description: "Full Term",
    classesBegin: "2027-01-11",
    dropAddEnds: "2027-01-15",
    censusDate: "2027-01-27",
    withdrawalDeadline: "2027-03-12",
    classesEnd: "2027-05-04",
    finalsEnd: null,
  };
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  writer = createScrapeDb(testDb.url, 3);
  sql = postgres(testDb.url, { max: 2, onnotice: () => undefined });
  for (const period of [SPRING, FALL]) {
    await reconcileTerm(
      {
        academicPeriod: period,
        description: period === SPRING ? "Spring 2027" : "Fall 2026",
        partOfTermRows: [partOfTerm(period)],
        rows: SECTIONS.filter((s) => s.period === period).flatMap(rowsOf),
      },
      writer,
      { invariants: "report" },
    );
  }
  // The coordinates the building import would have written.
  await sql`update schedule_builder.buildings
            set address = '1 Boyd Way', latitude = 33.9, longitude = -83.37 where id = 24`;
  await sql`insert into schedule_builder."courseDetails"
              ("courseId", description, "gradingSystem", "lastFetched", prerequisites)
            select id, 'Programming basics.', 'Letter', '2026-10-05 14:35:00', '{"type":"course","code":"MATH1113"}'::jsonb
            from schedule_builder.courses where abbr = 'CSCI1301'`;
});

afterAll(async () => {
  await writer?.$client.end({ timeout: 5 });
  await sql?.end({ timeout: 5 });
  await testDb?.drop();
});

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    read: (fn) => withCatalogReader(testDb.url, fn),
    log: () => undefined,
    ...overrides,
  };
}

async function call(operationId: string, path: string, expectStatus = 200, apiDeps = deps()) {
  const response = await handleApiRequest(new Request(`${BASE}${path}`), apiDeps);
  const body: unknown = await response.json();
  expect(response.status, `${path}: ${JSON.stringify(body)}`).toBe(expectStatus);
  if (validator.has(operationId, expectStatus)) {
    expect(validator.check(operationId, expectStatus, body), path).toEqual([]);
  }
  return { response, body: body as any };
}

describe("GET /terms", () => {
  it("lists available terms newest first, with the drop/add end dates", async () => {
    const { body } = await call("listTerms", "/terms");
    expect(body.terms.map((t: any) => t.academicPeriod)).toEqual([SPRING, FALL]);
    expect(body.terms[0]).toMatchObject({
      description: "Spring 2027",
      classesBegin: "2027-01-11",
      classesEnd: "2027-05-04",
      dropAddEnds: "2027-01-15",
    });
    expect(body.terms[0].partsOfTerm).toEqual([
      {
        code: "1",
        description: "Full Term",
        classesBegin: "2027-01-11",
        dropAddEnds: "2027-01-15",
        censusDate: "2027-01-27",
        withdrawalDeadline: "2027-03-12",
        classesEnd: "2027-05-04",
        finalsEnd: null,
      },
    ]);
  });

  it("leaves out a term with no section on offer", async () => {
    await sql`insert into schedule_builder.terms ("academicPeriod", description) values (202705, 'Summer 2027')`;
    const { body } = await call("listTerms", "/terms");
    expect(body.terms.map((t: any) => t.academicPeriod)).not.toContain(202705);
  });
});

describe("GET /subjects", () => {
  it("counts every course without a term, and only the offered ones with one", async () => {
    const all = await call("listSubjects", "/subjects");
    expect(all.body.term).toBeNull();
    expect(all.body.subjects.map((s: any) => s.abbr)).toEqual(["CSCI", "ENGL", "HIST", "MATH"]);
    expect(all.body.subjects.find((s: any) => s.abbr === "CSCI").courseCount).toBe(2);

    const spring = await call("listSubjects", `/subjects?term=${SPRING}`);
    expect(spring.body.term).toBe(SPRING);
    // HIST1111 is fully cancelled and ENGL1101 is Fall only.
    expect(spring.body.subjects.map((s: any) => [s.abbr, s.courseCount])).toEqual([
      ["CSCI", 2],
      ["MATH", 1],
    ]);
  });
});

describe("GET /subjects/{abbr}/courses", () => {
  it("lists a subject's offered courses with their non-cancelled section counts, case-insensitively", async () => {
    const { body } = await call("listSubjectCourses", `/subjects/csci/courses?term=${SPRING}`);
    expect(body.subject).toEqual({ abbr: "CSCI", description: "Computer Science" });
    expect(body.courses.map((c: any) => [c.abbr, c.sectionCount])).toEqual([
      ["CSCI1301", 2],
      ["CSCI1302", 1],
    ]);
    expect(body.courses[0]).toMatchObject({
      courseNumber: "1301",
      title: "Introduction to Programming",
      subject: "CSCI",
      minCreditHours: 3,
      maxCreditHours: 4,
      honors: false,
    });
  });

  it("404s an unknown subject and returns an empty list for a term without it", async () => {
    await call("listSubjectCourses", `/subjects/ZZZZ/courses?term=${SPRING}`, 404);
    const { body } = await call("listSubjectCourses", `/subjects/ENGL/courses?term=${SPRING}`);
    expect(body.courses).toEqual([]);
  });
});

describe("GET /search", () => {
  it("finds a course by title words, by code with or without the space, and by code prefix", async () => {
    for (const q of ["programming", "csci1301", "csci 1301", "CSCI-1301", "csci13"]) {
      const { body } = await call("searchCourses", `/search?term=${SPRING}&q=${encodeURIComponent(q)}`);
      expect(body.results.map((c: any) => c.abbr), q).toContain("CSCI1301");
    }
  });

  it("puts the exact code first, and leaves out courses not on offer in the term", async () => {
    const { body } = await call("searchCourses", `/search?term=${SPRING}&q=csci1302`);
    expect(body.results[0].abbr).toBe("CSCI1302");
    const history = await call("searchCourses", `/search?term=${SPRING}&q=history`);
    expect(history.body.results).toEqual([]);
    const composition = await call("searchCourses", `/search?term=${SPRING}&q=composition`);
    expect(composition.body.results).toEqual([]);
    const fall = await call("searchCourses", `/search?term=${FALL}&q=composition`);
    expect(fall.body.results.map((c: any) => c.abbr)).toEqual(["ENGL1101"]);
  });

  it("honours limit and echoes it, and never returns more than asked", async () => {
    const { body } = await call("searchCourses", `/search?term=${SPRING}&q=csci&limit=1`);
    expect(body.limit).toBe(1);
    expect(body.results).toHaveLength(1);
    const defaults = await call("searchCourses", `/search?term=${SPRING}&q=csci`);
    expect(defaults.body.limit).toBe(20);
  });

  it("treats web-search syntax as syntax and hostile input as text", async () => {
    await call("searchCourses", `/search?term=${SPRING}&q=${encodeURIComponent('"intro to" -calculus')}`);
    await call("searchCourses", `/search?term=${SPRING}&q=${encodeURIComponent("'; drop table x; --")}`);
    await call("searchCourses", `/search?term=${SPRING}&q=${encodeURIComponent("%_\\")}`);
    const { body } = await call("searchCourses", `/search?term=${SPRING}&q=${encodeURIComponent("calculus -programming")}`);
    expect(body.results.map((c: any) => c.abbr)).toEqual(["MATH2250"]);
  });

  it("returns 400 over the cap, with the same body the spec describes", async () => {
    await call("searchCourses", `/search?term=${SPRING}&q=csci&limit=51`, 400);
  });
});

describe("GET /courses/{abbr}", () => {
  it("returns the course, its Bulletin details, and every term it is offered", async () => {
    const { body } = await call("getCourse", `/courses/CSCI1301?term=${SPRING}`);
    expect(body.course).toMatchObject({
      abbr: "CSCI1301",
      title: "Introduction to Programming",
      subject: { abbr: "CSCI", description: "Computer Science" },
      college: "Franklin College",
      department: "CSCI Department",
      honors: false,
    });
    expect(body.details).toMatchObject({
      description: "Programming basics.",
      gradingSystem: "Letter",
      prerequisites: { type: "course", code: "MATH1113" },
      lastFetched: "2026-10-05T14:35:00.000Z",
    });
    expect(body.offeredIn).toEqual([SPRING, FALL]);
    expect(body.sectionCount).toBe(2);
  });

  it("matches the code however it is spelled, and has no section count without a term", async () => {
    for (const spelling of ["csci1301", "csci%201301", "CSCI-1301"]) {
      const { body } = await call("getCourse", `/courses/${spelling}`);
      expect(body.course.abbr).toBe("CSCI1301");
      expect(body.sectionCount).toBeNull();
    }
  });

  it("has null details for a course without Bulletin data, and an empty offeredIn when fully cancelled", async () => {
    const { body } = await call("getCourse", `/courses/HIST1111?term=${SPRING}`);
    expect(body.details).toBeNull();
    expect(body.offeredIn).toEqual([]);
    expect(body.sectionCount).toBe(0);
  });

  it("404s a course the catalog has never seen", async () => {
    const { body } = await call("getCourse", "/courses/NOPE0000", 404);
    expect(body.error.code).toBe("not_found");
  });
});

describe("GET /course-exists", () => {
  it("is always 200: exists, and whether it is on offer in a term", async () => {
    const yes = await call("courseExists", `/course-exists?abbr=csci%201301&term=${SPRING}`);
    expect(yes.body).toEqual({ abbr: "CSCI1301", term: SPRING, exists: true, offered: true });

    const notOffered = await call("courseExists", `/course-exists?abbr=ENGL1101&term=${SPRING}`);
    expect(notOffered.body).toMatchObject({ exists: true, offered: false });

    const none = await call("courseExists", "/course-exists?abbr=NOPE0000");
    expect(none.body).toEqual({ abbr: "NOPE0000", term: null, exists: false, offered: null });
  });
});

describe("GET /sections", () => {
  it("returns sections with their meetings, building coordinates and cancelled flag", async () => {
    const { body } = await call("listSections", `/sections?term=${SPRING}&courses=CSCI1301`);
    expect(body.term).toBe(SPRING);
    expect(body.sections.map((s: any) => [s.crn, s.cancelled])).toEqual([
      [20001, false],
      [20002, false],
      [20003, true],
    ]);
    const first = body.sections[0];
    expect(first).toMatchObject({
      courseAbbr: "CSCI1301",
      creditHours: { min: 3, max: 4 },
      campus: { abbr: "ATH", description: "Athens" },
      professor: { name: "Jane Doe" },
      seatsAvailable: 20,
      maximumEnrollment: 30,
      academicPeriod: SPRING,
      dateRange: { start: "2027-01-11", end: "2027-05-04" },
    });
    expect(first.meetings).toHaveLength(2);
    expect(first.meetings[0]).toMatchObject({
      days: expect.arrayContaining(["monday", "wednesday"]),
      startTime: "09:30:00",
      endTime: "10:45:00",
      room: "101",
      locationStatus: "RESERVED",
      building: { code: "24", address: "1 Boyd Way", lat: 33.9, lon: -83.37 },
    });
    expect(first.meetings[1].days).toEqual(["friday"]);
    expect(body.sections[1].professor).toEqual({ name: "Jane Doe" });
    expect(body.sections[2].professor).toBeNull();
  });

  it("names courses by id or code, skips unknown codes, and reports NCRR and TBA locations", async () => {
    const course = await call("getCourse", "/courses/MATH2250");
    const id = course.body.course.courseId as number;
    const { body } = await call(
      "listSections",
      `/sections?term=${SPRING}&courseIds=${id}&courses=NOPE0000,CSCI1302`,
    );
    expect(body.sections.map((s: any) => s.courseAbbr)).toEqual(["CSCI1302", "MATH2250"]);
    expect(body.sections[1].meetings[0]).toMatchObject({ locationStatus: "NCRR", building: null });
    expect(body.sections[0].meetings[0]).toMatchObject({ locationStatus: "TBA", building: null });
  });

  it("returns an empty list, not an error, when the courses have no sections in the term", async () => {
    const { body } = await call("listSections", `/sections?term=${SPRING}&courses=ENGL1101`);
    expect(body.sections).toEqual([]);
  });

  it("accepts exactly 15 courses and refuses 16 with the spec's 400", async () => {
    const codes = (n: number) => Array.from({ length: n }, (_, i) => `ZZZ${1000 + i}`).join(",");
    await call("listSections", `/sections?term=${SPRING}&courses=${codes(15)}`);
    const { body } = await call("listSections", `/sections?term=${SPRING}&courses=${codes(16)}`, 400);
    expect(body.error.code).toBe("too_many_courses");
  });
});

describe("limits", () => {
  it("returns the spec's 429 with Retry-After, and the search limiter is separate", async () => {
    const deny: Limiter = { limit: async () => ({ success: false }) };
    const allow: Limiter = { limit: async () => ({ success: true }) };

    const blocked = await call("listTerms", "/terms", 429, deps({ limiter: deny }));
    expect(blocked.body.error.code).toBe("rate_limited");
    expect(blocked.response.headers.get("Retry-After")).toBe("60");

    await call("searchCourses", `/search?term=${SPRING}&q=csci`, 429, deps({ limiter: allow, searchLimiter: deny }));
    await call("listTerms", "/terms", 200, deps({ limiter: allow, searchLimiter: deny }));
  });
});

describe("the read-only role", () => {
  it("cannot write, even through the router's own connection", async () => {
    await expect(
      withCatalogReader(testDb.url, (tx) => tx`delete from uga.offerings`),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|25006)$/) as unknown });
  });

  it("answers 503 with Retry-After when a query outlives the statement timeout", async () => {
    const response = await handleApiRequest(
      new Request(`${BASE}/terms`),
      deps({
        read: (fn) =>
          withCatalogReader(testDb.url, async (tx) => {
            await tx`select set_config('statement_timeout', '50', true)`;
            await tx`select pg_sleep(1)`;
            return fn(tx);
          }),
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
  });
});
