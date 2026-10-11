/**
 * The catalog's reads: plain SQL against the `uga` views, inside the read-only
 * transaction `withCatalogReader` opens. Each function returns exactly the JSON
 * shape openapi/catalog.yaml describes.
 *
 * Dates and times are cast to text in SQL (`date` would otherwise arrive as a
 * `Date` at midnight UTC and a `time` as a string only by luck of the driver),
 * counts are cast to `int` (`count(*)` is a bigint, which the driver hands over
 * as a string), and lists are passed as one jsonb parameter and unnested in
 * SQL, because the reader skips the driver's type fetch (see db/reader.ts) and so has
 * no array serializer.
 */
import type { ReadSql } from "~/db/reader";
import { notFound } from "./errors";

// ── Terms ────────────────────────────────────────────────────────────────────

type PartOfTermRow = {
  code: string;
  description: string;
  classesBegin: string;
  dropAddEnds: string;
  censusDate: string;
  withdrawalDeadline: string;
  classesEnd: string;
  finalsEnd: string | null;
};

type TermPart = PartOfTermRow;

export type TermJson = {
  academicPeriod: number;
  description: string;
  classesBegin: string | null;
  classesEnd: string | null;
  dropAddEnds: string | null;
  partsOfTerm: TermPart[];
};

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

/** The part of term that runs longest: the term's own dates. Ties go to the first code. */
export function longestPart(parts: readonly TermPart[]): TermPart | null {
  let best: TermPart | null = null;
  let bestDays = -1;
  for (const part of [...parts].sort((a, b) => a.code.localeCompare(b.code))) {
    const days = daysBetween(part.classesBegin, part.classesEnd);
    if (days > bestDays) {
      best = part;
      bestDays = days;
    }
  }
  return best;
}

export async function listTerms(sql: ReadSql): Promise<{ terms: TermJson[] }> {
  const rows = await sql<
    (Partial<PartOfTermRow> & {
      academicPeriod: number;
      termDescription: string;
      partDescription: string | null;
    })[]
  >`
    select t."academicPeriod", t.description as "termDescription",
           p.code, p.description as "partDescription",
           p."classesBegin"::text as "classesBegin", p."dropAddEnds"::text as "dropAddEnds",
           p."censusDate"::text as "censusDate", p."withdrawalDeadline"::text as "withdrawalDeadline",
           p."classesEnd"::text as "classesEnd", p."finalsEnd"::text as "finalsEnd"
    from uga.terms t
    left join uga."partsOfTerm" p on p."academicPeriod" = t."academicPeriod"
    where t.available
    order by t."academicPeriod" desc, p."classesBegin", p.code
  `;

  const terms = new Map<number, TermJson>();
  for (const row of rows) {
    let term = terms.get(row.academicPeriod);
    if (!term) {
      term = {
        academicPeriod: row.academicPeriod,
        description: row.termDescription,
        classesBegin: null,
        classesEnd: null,
        dropAddEnds: null,
        partsOfTerm: [],
      };
      terms.set(row.academicPeriod, term);
    }
    if (row.code != null) {
      term.partsOfTerm.push({
        code: row.code,
        description: row.partDescription ?? "",
        classesBegin: row.classesBegin!,
        dropAddEnds: row.dropAddEnds!,
        censusDate: row.censusDate!,
        withdrawalDeadline: row.withdrawalDeadline!,
        classesEnd: row.classesEnd!,
        finalsEnd: row.finalsEnd ?? null,
      });
    }
  }
  for (const term of terms.values()) {
    const part = longestPart(term.partsOfTerm);
    term.classesBegin = part?.classesBegin ?? null;
    term.classesEnd = part?.classesEnd ?? null;
    term.dropAddEnds = part?.dropAddEnds ?? null;
  }
  return { terms: [...terms.values()] };
}

// ── Subjects ─────────────────────────────────────────────────────────────────

export type SubjectJson = {
  abbr: string;
  description: string;
  courseCount: number;
};

export async function listSubjects(
  sql: ReadSql,
  term: number | null,
): Promise<{ term: number | null; subjects: SubjectJson[] }> {
  const subjects =
    term === null
      ? await sql<SubjectJson[]>`
          select s.abbr, s.description, count(c.id)::int as "courseCount"
          from uga.subjects s
          left join uga.courses c on c."subjectId" = s.id
          group by s.id, s.abbr, s.description
          order by s.abbr`
      : await sql<SubjectJson[]>`
          select s.abbr, s.description, count(distinct c.id)::int as "courseCount"
          from uga.subjects s
          join uga.courses c on c."subjectId" = s.id
          join uga.offerings o on o."courseId" = c.id
            and o."academicPeriod" = ${term} and not o.cancelled
          group by s.id, s.abbr, s.description
          order by s.abbr`;
  return { term, subjects: [...subjects] };
}

// ── Courses ──────────────────────────────────────────────────────────────────

export type CourseSummaryJson = {
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  subject: string;
  minCreditHours: number;
  maxCreditHours: number;
  honors: boolean;
  sectionCount: number;
};

export async function listSubjectCourses(
  sql: ReadSql,
  subjectAbbr: string,
  term: number,
): Promise<{
  term: number;
  subject: { abbr: string; description: string };
  courses: CourseSummaryJson[];
}> {
  const [subject] = await sql<
    { id: number; abbr: string; description: string }[]
  >`
    select id, abbr, description from uga.subjects where abbr = ${subjectAbbr}`;
  if (!subject) throw notFound(`No subject ${subjectAbbr}.`);

  const courses = await sql<CourseSummaryJson[]>`
    select c.id as "courseId", c.abbr, c."courseNumber", c.title, s.abbr as subject,
           c."minCreditHours", c."maxCreditHours", c.honors,
           count(o.crn)::int as "sectionCount"
    from uga.courses c
    join uga.subjects s on s.id = c."subjectId"
    join uga.offerings o on o."courseId" = c.id
      and o."academicPeriod" = ${term} and not o.cancelled
    where c."subjectId" = ${subject.id}
    group by c.id, c.abbr, c."courseNumber", c.title, s.abbr,
             c."minCreditHours", c."maxCreditHours", c.honors
    order by c."courseNumber", c.abbr`;
  return {
    term,
    subject: { abbr: subject.abbr, description: subject.description },
    courses: [...courses],
  };
}

/** A search term as a prefix of a course code (`csci13` finds CSCI1301), or null when it is not shaped like one. */
export function codePrefix(query: string): string | null {
  const compact = query.replace(/[\s.-]+/g, "").toUpperCase();
  return /^[A-Z]{2,5}\d{0,5}[A-Z]{0,2}$/.test(compact) && /[A-Z]/.test(compact)
    ? compact
    : null;
}

export async function searchCourses(
  sql: ReadSql,
  term: number,
  query: string,
  limit: number,
): Promise<{
  term: number;
  query: string;
  limit: number;
  results: CourseSummaryJson[];
}> {
  const prefix = codePrefix(query);
  // `like` metacharacters cannot occur: the prefix is letters and digits only.
  const prefixPattern = prefix === null ? null : `${prefix}%`;

  const results = await sql<CourseSummaryJson[]>`
    select c.id as "courseId", c.abbr, c."courseNumber", c.title, s.abbr as subject,
           c."minCreditHours", c."maxCreditHours", c.honors,
           (select count(*)::int from uga.offerings o
             where o."courseId" = c.id and o."academicPeriod" = ${term} and not o.cancelled) as "sectionCount"
    from uga.courses c
    join uga.subjects s on s.id = c."subjectId"
    cross join websearch_to_tsquery('english', ${query}::text) as tsq
    where (c."searchDocument" @@ tsq
           ${prefixPattern === null ? sql`` : sql`or c.abbr like ${prefixPattern}::text`})
      and exists (select 1 from uga.offerings o
                  where o."courseId" = c.id and o."academicPeriod" = ${term} and not o.cancelled)
    order by (c.abbr = ${prefix ?? ""}::text) desc,
             ts_rank_cd(c."searchDocument", tsq) desc,
             c.abbr
    limit ${limit}`;
  return { term, query, limit, results: [...results] };
}

export type CourseDetailJson = {
  course: {
    courseId: number;
    abbr: string;
    courseNumber: string;
    title: string;
    abbrTitle: string;
    subject: { abbr: string; description: string };
    college: string;
    department: string | null;
    minCreditHours: number;
    maxCreditHours: number;
    minBillingCreditHours: number;
    honors: boolean;
  };
  details: {
    description: string | null;
    gradingSystem: string | null;
    semesterOffered: string | null;
    corequisite: string | null;
    equivalentCourses: string | null;
    prerequisites: unknown;
    lastFetched: string;
  } | null;
  offeredIn: number[];
  sectionCount: number | null;
};

export async function getCourse(
  sql: ReadSql,
  code: string,
  term: number | null,
): Promise<CourseDetailJson> {
  const [row] = await sql<
    {
      courseId: number;
      abbr: string;
      courseNumber: string;
      title: string;
      abbrTitle: string;
      subjectAbbr: string;
      subjectDescription: string;
      college: string;
      department: string | null;
      minCreditHours: number;
      maxCreditHours: number;
      minBillingCreditHours: number;
      honors: boolean;
    }[]
  >`
    select c.id as "courseId", c.abbr, c."courseNumber", c.title, c."abbrTitle",
           s.abbr as "subjectAbbr", s.description as "subjectDescription",
           col.description as college, d.description as department,
           c."minCreditHours", c."maxCreditHours", c."minBillingCreditHours", c.honors
    from uga.courses c
    join uga.subjects s on s.id = c."subjectId"
    join uga.colleges col on col.id = c."collegeId"
    left join uga.departments d on d.id = c."departmentId"
    where c.abbr = ${code}`;
  if (!row) throw notFound(`No course ${code}.`);

  const [detail] = await sql<
    {
      description: string | null;
      gradingSystem: string | null;
      semesterOffered: string | null;
      corequisite: string | null;
      equivalentCourses: string | null;
      prerequisites: unknown;
      lastFetched: Date;
    }[]
  >`
    select description, "gradingSystem", "semesterOffered", corequisite,
           "equivalentCourses", prerequisites, ("lastFetched" at time zone 'UTC') as "lastFetched"
    from uga."courseDetails"
    where "courseId" = ${row.courseId}
    order by "lastFetched" desc
    limit 1`;

  const offered = await sql<{ academicPeriod: number; sections: number }[]>`
    select o."academicPeriod", count(*)::int as sections
    from uga.offerings o
    where o."courseId" = ${row.courseId} and not o.cancelled
    group by o."academicPeriod"
    order by o."academicPeriod" desc`;

  return {
    course: {
      courseId: row.courseId,
      abbr: row.abbr,
      courseNumber: row.courseNumber,
      title: row.title,
      abbrTitle: row.abbrTitle,
      subject: { abbr: row.subjectAbbr, description: row.subjectDescription },
      college: row.college,
      department: row.department,
      minCreditHours: row.minCreditHours,
      maxCreditHours: row.maxCreditHours,
      minBillingCreditHours: row.minBillingCreditHours,
      honors: row.honors,
    },
    details: detail
      ? {
          description: detail.description,
          gradingSystem: detail.gradingSystem,
          semesterOffered: detail.semesterOffered,
          corequisite: detail.corequisite,
          equivalentCourses: detail.equivalentCourses,
          prerequisites: detail.prerequisites ?? null,
          lastFetched: detail.lastFetched.toISOString(),
        }
      : null,
    offeredIn: offered.map((o) => o.academicPeriod),
    sectionCount:
      term === null
        ? null
        : (offered.find((o) => o.academicPeriod === term)?.sections ?? 0),
  };
}

export async function courseExists(
  sql: ReadSql,
  code: string,
  term: number | null,
): Promise<{
  abbr: string;
  term: number | null;
  exists: boolean;
  offered: boolean | null;
}> {
  const [row] = await sql<{ abbr: string; offered: boolean }[]>`
    select c.abbr,
           (${term}::int is not null and exists (
              select 1 from uga.offerings o
              where o."courseId" = c.id and o."academicPeriod" = ${term}::int and not o.cancelled)) as offered
    from uga.courses c
    where c.abbr = ${code}`;
  return {
    abbr: row?.abbr ?? code,
    term,
    exists: row !== undefined,
    offered: term === null ? null : (row?.offered ?? false),
  };
}

// ── Sections ─────────────────────────────────────────────────────────────────

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Day = (typeof DAYS)[number];

export type MeetingJson = {
  days: Day[];
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  building: {
    code: string;
    description: string | null;
    address: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  room: string | null;
  locationStatus: "TBA" | "NCRR" | "RESERVED";
};

export type SectionJson = {
  crn: number;
  courseId: number;
  courseAbbr: string;
  courseNumber: string;
  courseTitle: string;
  creditHours: { min: number; max: number };
  campus: { id: number; abbr: string; description: string };
  professor: { name: string } | null;
  seatsAvailable: number;
  actualEnrollment: number;
  maximumEnrollment: number;
  cancelled: boolean;
  lastSeenAt: string;
  academicPeriod: number;
  dateRange: { start: string; end: string } | null;
  meetings: MeetingJson[];
};

type SectionRow = {
  crn: number;
  courseId: number;
  courseAbbr: string;
  courseNumber: string;
  courseTitle: string;
  minCreditHours: number;
  maxCreditHours: number;
  campusId: number;
  campusAbbr: string;
  campusDescription: string;
  instructorId: number | null;
  firstName: string | null;
  lastName: string | null;
  seatsAvailable: number;
  actualEnrollment: number;
  maximumEnrollment: number;
  cancelled: boolean;
  lastSeenAt: Date;
  academicPeriod: number;
  classesBegin: string;
  classesEnd: string;
  meetingId: number | null;
  monday: boolean | null;
  tuesday: boolean | null;
  wednesday: boolean | null;
  thursday: boolean | null;
  friday: boolean | null;
  saturday: boolean | null;
  sunday: boolean | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  locationStatus: "TBA" | "NCRR" | "RESERVED" | null;
  buildingId: number | null;
  buildingDescription: string | null;
  buildingAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Folds the flat join rows into sections, one meeting per meeting row. Pure, so it is unit-tested. */
export function groupSections(rows: readonly SectionRow[]): SectionJson[] {
  const sections = new Map<string, SectionJson>();
  for (const row of rows) {
    const key = `${row.academicPeriod}:${row.crn}`;
    let section = sections.get(key);
    if (!section) {
      section = {
        crn: row.crn,
        courseId: row.courseId,
        courseAbbr: row.courseAbbr,
        courseNumber: row.courseNumber,
        courseTitle: row.courseTitle,
        creditHours: { min: row.minCreditHours, max: row.maxCreditHours },
        campus: {
          id: row.campusId,
          abbr: row.campusAbbr,
          description: row.campusDescription,
        },
        professor:
          row.instructorId !== null
            ? { name: `${row.firstName} ${row.lastName}` }
            : null,
        seatsAvailable: row.seatsAvailable,
        actualEnrollment: row.actualEnrollment,
        maximumEnrollment: row.maximumEnrollment,
        cancelled: row.cancelled,
        lastSeenAt: row.lastSeenAt.toISOString(),
        academicPeriod: row.academicPeriod,
        dateRange: { start: row.classesBegin, end: row.classesEnd },
        meetings: [],
      };
      sections.set(key, section);
    }
    if (row.meetingId !== null) {
      section.meetings.push({
        days: DAYS.filter((day) => row[day] === true),
        startDate: row.startDate,
        endDate: row.endDate,
        startTime: row.startTime,
        endTime: row.endTime,
        building:
          row.buildingId !== null
            ? {
                // `buildings.id` is the registrar's number, so this is it
                // without the leading zeros the registrar pads it with.
                code: String(row.buildingId),
                description: row.buildingDescription,
                address: row.buildingAddress,
                lat: row.latitude,
                lon: row.longitude,
              }
            : null,
        room: row.room,
        locationStatus: row.locationStatus ?? "TBA",
      });
    }
  }
  return [...sections.values()];
}

export async function listSections(
  sql: ReadSql,
  term: number,
  codes: readonly string[],
  ids: readonly number[],
): Promise<{ term: number; sections: SectionJson[] }> {
  const rows = await sql<SectionRow[]>`
    select o.crn, c.id as "courseId", c.abbr as "courseAbbr", c."courseNumber",
           c.title as "courseTitle", c."minCreditHours", c."maxCreditHours",
           camp.id as "campusId", camp.abbr as "campusAbbr", camp.description as "campusDescription",
           i.id as "instructorId", i."firstName", i."lastName",
           o."seatsAvailable", o."actualEnrollment", o."maximumEnrollment", o.cancelled,
           (o."lastSeenAt" at time zone 'UTC') as "lastSeenAt", o."academicPeriod",
           p."classesBegin"::text as "classesBegin", p."classesEnd"::text as "classesEnd",
           m.id as "meetingId", m.monday, m.tuesday, m.wednesday, m.thursday, m.friday,
           m.saturday, m.sunday,
           m."startDate"::text as "startDate", m."endDate"::text as "endDate",
           m."startTime"::text as "startTime", m."endTime"::text as "endTime",
           m.room, m."locationStatus"::text as "locationStatus",
           b.id as "buildingId", b.description as "buildingDescription",
           b.address as "buildingAddress", b.latitude, b.longitude
    from uga.offerings o
    join uga.courses c on c.id = o."courseId"
    join uga."partsOfTerm" p on p."academicPeriod" = o."academicPeriod" and p.code = o."partOfTerm"
    join uga.campuses camp on camp.id = o."campusId"
    left join uga.instructors i on i.id = o."instructorId"
    left join uga.meetings m on m."academicPeriod" = o."academicPeriod" and m."offeringCrn" = o.crn
    left join uga.buildings b on b.id = m."buildingId"
    where o."academicPeriod" = ${term}
      and (c.abbr in (select jsonb_array_elements_text(${sql.json([...codes])}))
           or c.id in (select (jsonb_array_elements_text(${sql.json([...ids])}))::int))
    order by c.abbr, o.crn, m.id`;
  return { term, sections: groupSections(rows) };
}
