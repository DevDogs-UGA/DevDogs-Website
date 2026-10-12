import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_PER_MINUTE,
  SEARCH_MAX_LIMIT,
  SECTIONS_MAX_COURSES,
} from "~/api/limits";
import { responseValidator } from "../spec";

/**
 * The contract against a DEPLOYED catalog, over the network:
 *
 *   CATALOG_URL=https://api-staging.devdogsuga.org/catalog/v1 pnpm test:live
 *
 * Reads whatever data the catalog holds, so it asserts shapes, caps and
 * limits, not particular courses. Every body is validated against
 * openapi/catalog.yaml, as in test/db/contract.db-test.ts. Also the Gate's
 * post-deploy check of production.
 *
 * The 429 test sends enough requests to trip the per-IP limit, so it only runs
 * with `CATALOG_TEST_RATE_LIMIT=1` (and, once tripped, the address is limited
 * for a minute).
 */

const BASE = (process.env.CATALOG_URL ?? "").replace(/\/$/, "");
const validator = responseValidator();

type Json = any;

async function call(
  operationId: string,
  path: string,
  expectStatus = 200,
): Promise<{ response: Response; body: Json }> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "X-Client": "catalog-contract-test/1" },
  });
  const body: Json = await response.json();
  expect(response.status, `${path}: ${JSON.stringify(body)}`).toBe(
    expectStatus,
  );
  expect(validator.check(operationId, expectStatus, body), path).toEqual([]);
  return { response, body };
}

describe.skipIf(BASE === "")("the deployed catalog", () => {
  let term = 0;
  let subject = "";
  let courseCode = "";

  it("lists terms, newest first, and every response is cacheable JSON with CORS", async () => {
    const { response, body } = await call("listTerms", "/terms");
    expect(body.terms.length).toBeGreaterThan(0);
    const periods = body.terms.map((t: Json) => t.academicPeriod as number);
    expect([...periods].sort((a, b) => b - a)).toEqual(periods);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toMatch(
      /^public, max-age=60, s-maxage=\d+$/,
    );
    term = periods[0];
    // The newest term the registrar has published has drop/add dates.
    expect(body.terms[0].dropAddEnds).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lists the subjects on offer and a subject's courses", async () => {
    const { body } = await call("listSubjects", `/subjects?term=${term}`);
    expect(body.subjects.length).toBeGreaterThan(10);
    subject = body.subjects[0].abbr;
    const courses = await call(
      "listSubjectCourses",
      `/subjects/${subject}/courses?term=${term}`,
    );
    expect(courses.body.courses.length).toBeGreaterThan(0);
    courseCode = courses.body.courses[0].abbr;
  });

  it("searches, finds a course by its own code, and never returns more than the cap", async () => {
    const byCode = await call(
      "searchCourses",
      `/search?term=${term}&q=${encodeURIComponent(courseCode)}`,
    );
    expect(byCode.body.results[0].abbr).toBe(courseCode);
    const many = await call(
      "searchCourses",
      `/search?term=${term}&q=a&limit=${SEARCH_MAX_LIMIT}`,
    );
    expect(many.body.results.length).toBeLessThanOrEqual(SEARCH_MAX_LIMIT);
  });

  it("returns one course, whether it exists, and its sections", async () => {
    const course = await call(
      "getCourse",
      `/courses/${courseCode}?term=${term}`,
    );
    expect(course.body.offeredIn).toContain(term);
    const exists = await call(
      "courseExists",
      `/course-exists?abbr=${courseCode}&term=${term}`,
    );
    expect(exists.body).toMatchObject({ exists: true, offered: true });
    const sections = await call(
      "listSections",
      `/sections?term=${term}&courses=${courseCode}`,
    );
    expect(sections.body.sections.length).toBeGreaterThan(0);
    await call("getCourse", "/courses/NOPE0000", 404);
  });

  it("refuses what is over the caps with a 400, and a malformed request too", async () => {
    await call(
      "searchCourses",
      `/search?term=${term}&q=a&limit=${SEARCH_MAX_LIMIT + 1}`,
      400,
    );
    const codes = Array.from(
      { length: SECTIONS_MAX_COURSES + 1 },
      (_, i) => `ZZZ${1000 + i}`,
    ).join(",");
    const tooMany = await call(
      "listSections",
      `/sections?term=${term}&courses=${codes}`,
      400,
    );
    expect(tooMany.body.error.code).toBe("too_many_courses");
    await call("searchCourses", `/search?term=${term}`, 400);
    await call("listSections", "/sections?courses=CSCI1301", 400);
    await call("listSubjects", "/subjects?term=nope", 400);
  });

  it("is read-only", async () => {
    const response = await fetch(`${BASE}/terms`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it.skipIf(process.env.CATALOG_TEST_RATE_LIMIT !== "1")(
    "answers 429 with Retry-After once an address passes the per-IP limit",
    async () => {
      const statuses: number[] = [];
      let limited: Response | undefined;
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE * 2 && !limited; i += 1) {
        // Distinct queries, so the edge cache cannot answer instead of the Worker.
        const response = await fetch(
          `${BASE}/course-exists?abbr=ZZZ${1000 + i}`,
        );
        statuses.push(response.status);
        if (response.status === 429) limited = response;
        else await response.arrayBuffer();
      }
      expect(limited, `statuses: ${statuses.join(",")}`).toBeDefined();
      expect(limited!.headers.get("retry-after")).toBe("60");
      const body: Json = await limited!.json();
      expect(validator.check("courseExists", 429, body)).toEqual([]);
    },
  );
});
