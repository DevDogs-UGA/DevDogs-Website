import { offerings } from "~/db/schema";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";

interface PendingOffering {
  crn: number;
  crossListingId: string | null;
  minimumEnrollment: number;
  maximumEnrollment: number;
  actualEnrollment: number;
  seatsAvailable: number;
  cancelled: boolean;
  lastSeenAt: Date;
  academicPeriod: number;
  partOfTerm: string;
  courseAbbr: string;
  instructorKey: string | null;
  scheduleTypeAbbr: string;
  campusAbbr: string;
}

export class OfferingCollector {
  private readonly pending = new Map<number, PendingOffering>();
  private readonly unknownParts = new Map<string, number>();

  /**
   * Sections left out because the feed names a part of term the calendar did
   * not give dates for (and the database has none), by part code. Valid for
   * after `flush`.
   */
  get sectionsInUnknownParts(): ReadonlyMap<string, number> {
    return this.unknownParts;
  }

  collect(row: Row): void {
    const crn = parseInt(
      row["SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER"] ?? "",
      10,
    );
    const academicPeriod = parseInt(row.ACADEMIC_PERIOD ?? "", 10);
    const partOfTerm = row["SSBSECT.SSBSECT_PTRM_CODE"];
    if (isNaN(crn) || isNaN(academicPeriod) || !partOfTerm) return;

    const courseAbbr = row["SCHEDULE_OFFERING.COURSE_IDENTIFICATION"] ?? "";
    const scheduleTypeAbbr = row["SCHEDULE_OFFERING.SCHEDULE"] ?? "";
    const campusAbbr = row["SCHEDULE_OFFERING.CAMPUS"] ?? "";
    if (!courseAbbr || !scheduleTypeAbbr || !campusAbbr) return;

    const firstName =
      row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_FIRST_NAME"] ?? "";
    const lastName =
      row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_LAST_NAME"] ?? "";
    const instructorKey =
      firstName || lastName ? `${firstName}::${lastName}` : null;

    this.pending.set(crn, {
      crn,
      crossListingId: row["SCHEDULE_OFFERING.SECTION_CROSS_LIST"] ?? null,
      minimumEnrollment: 0,
      maximumEnrollment: parseInt(
        row["SCHEDULE_OFFERING.MAXIMUM_ENROLLMENT"] ?? "0",
        10,
      ),
      actualEnrollment: parseInt(
        row["SCHEDULE_OFFERING.ACTUAL_ENROLLMENT"] ?? "0",
        10,
      ),
      seatsAvailable: parseInt(
        row["SCHEDULE_OFFERING.SEATS_AVAILABLE"] ?? "0",
        10,
      ),
      cancelled: row["SCHEDULE_OFFERING.STATUS"] !== "A",
      lastSeenAt: new Date(),
      academicPeriod,
      partOfTerm,
      courseAbbr,
      instructorKey,
      scheduleTypeAbbr,
      campusAbbr,
    });
  }

  /** Bulk-upserts offerings and returns the set of CRNs that resolved to a valid row. */
  async flush(
    tx: DrizzleTransaction,
    courseIdMap: Map<string, number>,
    instructorIdMap: Map<string, number>,
    scheduleTypeIdMap: Map<string, number>,
    campusIdMap: Map<string, number>,
    knownParts: ReadonlySet<string>,
  ): Promise<Set<number>> {
    const validCrns = new Set<number>();
    const rows: (typeof offerings.$inferInsert)[] = [];

    for (const o of this.pending.values()) {
      const courseId = courseIdMap.get(o.courseAbbr);
      const scheduleTypeId = scheduleTypeIdMap.get(o.scheduleTypeAbbr);
      const campusId = campusIdMap.get(o.campusAbbr);
      if (!courseId || !scheduleTypeId || !campusId) continue;
      // `offerings` references `partsOfTerm` by (term, code). A part the
      // registrar's calendar lists with a date it cannot parse (a clinical
      // rotation with "n/a" for its last day) has no row, and inserting its
      // sections would fail the whole term on the foreign key. They are left
      // out and reported instead (the `partsOfTermKnown` invariant).
      if (!knownParts.has(o.partOfTerm)) {
        this.unknownParts.set(
          o.partOfTerm,
          (this.unknownParts.get(o.partOfTerm) ?? 0) + 1,
        );
        continue;
      }

      validCrns.add(o.crn);
      rows.push({
        crn: o.crn,
        crossListingId: o.crossListingId,
        minimumEnrollment: o.minimumEnrollment,
        maximumEnrollment: o.maximumEnrollment,
        actualEnrollment: o.actualEnrollment,
        seatsAvailable: o.seatsAvailable,
        cancelled: o.cancelled,
        lastSeenAt: o.lastSeenAt,
        academicPeriod: o.academicPeriod,
        partOfTerm: o.partOfTerm,
        courseId,
        instructorId: o.instructorKey
          ? (instructorIdMap.get(o.instructorKey) ?? null)
          : null,
        scheduleTypeId,
        campusId,
      });
    }

    await bulkUpsert(tx, offerings, rows);
    return validCrns;
  }
}
