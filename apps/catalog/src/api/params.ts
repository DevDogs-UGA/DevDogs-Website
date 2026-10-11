import { ApiError, invalid, missing } from "./errors";
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  SECTIONS_MAX_COURSES,
} from "./limits";

/** An academic period is `YYYYMM` with `MM` 02, 05 or 08: Spring, Summer, Fall. */
export function parseTerm(value: string | null, name = "term"): number | null {
  if (value === null || value === "") return null;
  if (!/^\d{6}$/.test(value)) {
    throw invalid(`${name} must be a six-digit academic period such as 202702.`);
  }
  const term = Number(value);
  const year = Math.floor(term / 100);
  const month = term % 100;
  if (year < 2000 || year > 2999 || ![2, 5, 8].includes(month)) {
    throw invalid(
      `${name} ${value} is not an academic period: the last two digits are 02 (Spring), 05 (Summer) or 08 (Fall).`,
    );
  }
  return term;
}

export function requireTerm(value: string | null): number {
  const term = parseTerm(value);
  if (term === null) throw missing("term");
  return term;
}

/** A subject abbreviation: up to four letters or digits. Compared without regard to case. */
export function parseSubjectAbbr(value: string): string {
  const abbr = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(abbr)) {
    throw invalid("A subject abbreviation is one to four letters or digits.");
  }
  return abbr;
}

/**
 * A course code as the registrar spells it: `CSCI1301`, no space. Case,
 * spaces, hyphens and dots in the input are ignored, so `csci 1301` and
 * `CSCI-1301` find it.
 */
export function normalizeCourseCode(value: string): string {
  return value.replace(/[\s.-]+/g, "").toUpperCase();
}

export function parseCourseCode(value: string | null, name = "abbr"): string {
  if (value === null || value.trim() === "") throw missing(name);
  const code = normalizeCourseCode(value);
  if (!/^[A-Z0-9]{3,12}$/.test(code)) {
    throw invalid(`${name} must look like a course code, for example CSCI1301.`);
  }
  return code;
}

export function parseSearchQuery(value: string | null): string {
  const query = (value ?? "").trim().replace(/\s+/g, " ");
  if (query === "") throw missing("q");
  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw invalid(`q may be at most ${SEARCH_QUERY_MAX_LENGTH} characters.`);
  }
  return query;
}

export function parseSearchLimit(value: string | null): number {
  if (value === null || value === "") return SEARCH_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw invalid("limit must be a whole number.");
  const limit = Number(value);
  if (limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw invalid(`limit must be between 1 and ${SEARCH_MAX_LIMIT}.`);
  }
  return limit;
}

export type CourseSelection = { codes: string[]; ids: number[] };

/**
 * The courses a `/sections` request names: codes (`courses`), ids (`courseIds`),
 * or both, at most {@link SECTIONS_MAX_COURSES} together once duplicates are
 * dropped. Over the cap is an error, not a silent truncation: a client that
 * thinks it got every section must have got them.
 */
export function parseCourseSelection(
  courses: string | null,
  courseIds: string | null,
): CourseSelection {
  const codes = [
    ...new Set(
      (courses ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => parseCourseCode(part, "courses")),
    ),
  ];
  const ids = [
    ...new Set(
      (courseIds ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => {
          if (!/^\d{1,9}$/.test(part)) {
            throw invalid("courseIds must be comma-separated whole numbers.");
          }
          return Number(part);
        }),
    ),
  ];
  if (codes.length + ids.length === 0) {
    throw new ApiError(
      400,
      "missing_parameter",
      "Name at least one course with courses or courseIds.",
    );
  }
  if (codes.length + ids.length > SECTIONS_MAX_COURSES) {
    throw new ApiError(
      400,
      "too_many_courses",
      `At most ${SECTIONS_MAX_COURSES} courses per request; got ${codes.length + ids.length}.`,
    );
  }
  return { codes, ids };
}

/** The value of an `X-Client` header, or null when it is absent or malformed (it changes nothing, so a bad one is ignored). */
export function parseClient(value: string | null): string | null {
  return value !== null && /^[A-Za-z0-9._/-]{1,64}$/.test(value) ? value : null;
}
