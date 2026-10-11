import type { Row } from "./parsers/types";
import { parseTime } from "./parsers/utils";

/**
 * What the registrar's feed looked like, counted while it streamed by.
 *
 * The scrape invariants (see `invariants.ts`) mostly check what ended up in the
 * database. These are the ones only the feed can answer, such as a time
 * the parser could not read, which the database would simply store as null.
 */
export class RowStats {
  rows = 0;
  /** Rows whose section is Active (`STATUS` = `A`). */
  activeRows = 0;
  /** Rows with a meeting time (not blank, not `TBA`). */
  timedRows = 0;
  /** Timed rows whose start or end the parser could not read. */
  malformedTimes = 0;
  /** Rows naming a building that is neither numeric, `TBA` nor `NCRR`: they cannot get a `buildingId`. */
  unresolvableBuildings = 0;
  /** Rows with no course reference number: they cannot become sections. */
  rowsWithoutCrn = 0;

  collect(row: Row): void {
    this.rows += 1;
    if (row["SCHEDULE_OFFERING.STATUS"] === "A") this.activeRows += 1;
    if (!/^\d+$/.test(row["SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER"] ?? "")) {
      this.rowsWithoutCrn += 1;
    }

    const time = (row.Time ?? "").trim();
    if (time !== "" && time !== "TBA") {
      this.timedRows += 1;
      const [start, end] = time.split(/\s*-\s*/);
      if (parseTime(start) === null || parseTime(end) === null) {
        this.malformedTimes += 1;
      }
    }

    const building = (row.Building ?? "").trim();
    if (
      building !== "" &&
      building !== "TBA" &&
      building !== "NCRR" &&
      !/^\d+$/.test(building)
    ) {
      this.unresolvableBuildings += 1;
    }
  }
}
