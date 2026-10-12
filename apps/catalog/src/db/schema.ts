/**
 * The tables the scrape writes, as Drizzle sees them.
 *
 * This is a hand-trimmed copy of what `drizzle-kit pull` generates for
 * schedule-builder's `schedule_builder` schema (the registrar tables only, no
 * user data, no RLS policies: the scrape connects as `postgres`) plus
 * `platform."academicPrograms"`, which the Bulletin job fills. The database is
 * defined by supabase/schemas; `schema.db-test.ts` fails when a column here
 * and the real table disagree, so a drifting copy cannot ship.
 *
 * The catalog API itself does not use Drizzle. It reads the `uga` views with
 * plain SQL (src/api/queries.ts).
 */
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  real,
  serial,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const scheduleBuilder = pgSchema("schedule_builder");
export const platform = pgSchema("platform");

export const locationStatus = scheduleBuilder.enum("locationStatus", [
  "TBA",
  "NCRR",
  "RESERVED",
]);

export const academicProgramCategory = platform.enum(
  "academicProgramCategory",
  [
    "undergraduate_major",
    "graduate_major",
    "undergraduate_minor",
    "undergraduate_certificate",
    "graduate_certificate",
    "professional_program",
  ],
);

export const buildings = scheduleBuilder.table("buildings", {
  id: integer().primaryKey(),
  description: varchar().notNull(),
  address: varchar(),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
});

export const campuses = scheduleBuilder.table(
  "campuses",
  {
    id: serial().primaryKey(),
    abbr: varchar().notNull(),
    description: varchar().notNull(),
  },
  (table) => [unique("campuses_abbr_key").on(table.abbr)],
);

export const colleges = scheduleBuilder.table(
  "colleges",
  {
    id: serial().primaryKey(),
    description: varchar().notNull(),
  },
  (table) => [unique("colleges_description_key").on(table.description)],
);

export const departments = scheduleBuilder.table(
  "departments",
  {
    id: serial().primaryKey(),
    description: varchar().notNull(),
    collegeId: integer()
      .notNull()
      .references(() => colleges.id),
  },
  (table) => [unique("departments_description_key").on(table.description)],
);

export const subjects = scheduleBuilder.table(
  "subjects",
  {
    id: serial().primaryKey(),
    abbr: varchar({ length: 4 }).notNull(),
    description: varchar().notNull(),
  },
  (table) => [unique("subjects_abbr_key").on(table.abbr)],
);

export const courses = scheduleBuilder.table(
  "courses",
  {
    id: serial().primaryKey(),
    abbr: varchar().notNull(),
    title: varchar().notNull(),
    abbrTitle: varchar().notNull(),
    courseNumber: varchar().notNull(),
    minCreditHours: real().notNull(),
    maxCreditHours: real().notNull(),
    minBillingCreditHours: real().notNull(),
    honors: boolean().default(false).notNull(),
    collegeId: integer()
      .notNull()
      .references(() => colleges.id),
    departmentId: integer().references(() => departments.id),
    subjectId: integer()
      .notNull()
      .references(() => subjects.id),
  },
  (table) => [
    unique("courses_abbr_key").on(table.abbr),
    unique("unique_subject_courseNumber").on(
      table.subjectId,
      table.courseNumber,
    ),
  ],
);

export const instructors = scheduleBuilder.table(
  "instructors",
  {
    id: serial().primaryKey(),
    firstName: varchar().notNull(),
    lastName: varchar().notNull(),
  },
  (table) => [unique("unique_full_name").on(table.firstName, table.lastName)],
);

export const scheduleTypes = scheduleBuilder.table(
  "scheduleTypes",
  {
    id: serial().primaryKey(),
    abbr: varchar().notNull(),
    description: varchar().notNull(),
  },
  (table) => [unique("scheduleTypes_abbr_key").on(table.abbr)],
);

export const terms = scheduleBuilder.table("terms", {
  academicPeriod: integer().primaryKey(),
  description: varchar().notNull(),
});

export const partsOfTerm = scheduleBuilder.table(
  "partsOfTerm",
  {
    academicPeriod: integer()
      .notNull()
      .references(() => terms.academicPeriod),
    code: varchar().notNull(),
    description: varchar().notNull(),
    classesBegin: date().notNull(),
    dropAddEnds: date().notNull(),
    censusDate: date().notNull(),
    withdrawalDeadline: date().notNull(),
    classesEnd: date().notNull(),
    finalsEnd: date(),
  },
  (table) => [
    primaryKey({
      columns: [table.academicPeriod, table.code],
      name: "partsOfTerm_pkey",
    }),
  ],
);

export const offerings = scheduleBuilder.table(
  "offerings",
  {
    crn: integer().notNull(),
    crossListingId: varchar(),
    minimumEnrollment: integer().default(0).notNull(),
    maximumEnrollment: integer().notNull(),
    actualEnrollment: integer().notNull(),
    seatsAvailable: integer().notNull(),
    cancelled: boolean().default(false).notNull(),
    lastSeenAt: timestamp()
      .default(sql`now()`)
      .notNull(),
    academicPeriod: integer()
      .notNull()
      .references(() => terms.academicPeriod),
    partOfTerm: varchar().notNull(),
    courseId: integer()
      .notNull()
      .references(() => courses.id),
    instructorId: integer().references(() => instructors.id),
    scheduleTypeId: integer()
      .notNull()
      .references(() => scheduleTypes.id),
    campusId: integer()
      .notNull()
      .references(() => campuses.id),
  },
  (table) => [
    primaryKey({
      columns: [table.academicPeriod, table.crn],
      name: "offerings_pkey",
    }),
    foreignKey({
      columns: [table.academicPeriod, table.partOfTerm],
      foreignColumns: [partsOfTerm.academicPeriod, partsOfTerm.code],
      name: "offerings_academicPeriod_partOfTerm_fkey",
    }),
    index("offerings_academicPeriod_partOfTerm_index").using(
      "btree",
      table.academicPeriod.asc().nullsLast(),
      table.partOfTerm.asc().nullsLast(),
    ),
    index("offerings_crossListingId_index").using(
      "btree",
      table.crossListingId.asc().nullsLast(),
    ),
  ],
);

export const meetings = scheduleBuilder.table(
  "meetings",
  {
    id: serial().primaryKey(),
    monday: boolean().default(false).notNull(),
    tuesday: boolean().default(false).notNull(),
    wednesday: boolean().default(false).notNull(),
    thursday: boolean().default(false).notNull(),
    friday: boolean().default(false).notNull(),
    saturday: boolean().default(false).notNull(),
    sunday: boolean().default(false).notNull(),
    startDate: date(),
    endDate: date(),
    startTime: time(),
    endTime: time(),
    locationStatus: locationStatus().default("TBA").notNull(),
    buildingId: integer().references(() => buildings.id),
    room: varchar(),
    academicPeriod: integer().notNull(),
    offeringCrn: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.academicPeriod, table.offeringCrn],
      foreignColumns: [offerings.academicPeriod, offerings.crn],
      name: "meetings_academicPeriod_offeringCrn_fkey",
    }),
    index("meetings_academicPeriod_offeringCrn_index").using(
      "btree",
      table.academicPeriod.asc().nullsLast(),
      table.offeringCrn.asc().nullsLast(),
    ),
  ],
);

export const academicPrograms = platform.table(
  "academicPrograms",
  {
    id: integer().primaryKey(),
    name: text().notNull(),
    credential: text().notNull(),
    category: academicProgramCategory().notNull(),
    schoolCode: text(),
    bulletinUrl: text().notNull(),
    active: boolean().default(true).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("academicPrograms_active_name_idx").using(
      "btree",
      table.active.asc().nullsLast(),
      table.name.asc().nullsLast(),
      table.credential.asc().nullsLast(),
    ),
  ],
);
