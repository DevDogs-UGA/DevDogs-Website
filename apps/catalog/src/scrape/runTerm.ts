/**
 * One term, start to finish: open both of the registrar's sources, stream the
 * CSV through the collectors, then write it in one short transaction.
 *
 * Free of Workers modules, so the Workflow step and the local scrape script
 * (scripts/scrape-local.ts) run the identical code. A failure that retrying
 * cannot fix is a {@link FatalTermError}; the Workflow turns it into a
 * `NonRetryableError`, the script just reports it.
 */
import { withScrapeDb } from "~/db/client";
import { resolveDatabaseUrl, type DatabaseEnv } from "~/db/url";
import { InvariantViolationError } from "./invariants";
import { CalendarNotFoundError, academicPeriodInfo, fetchPartsOfTerm } from "./parsers";
import { fetchSemesterCsv } from "./parsers/AvailableTerms";
import { reconcileTerm, type TermReconcileResult } from "./parsers/reconcileTerm";

/** A failure that re-running would repeat: the feed is gone, is another term, or broke an invariant. */
export class FatalTermError extends Error {
  override readonly name = "FatalTermError";
}

export async function reconcileOneTerm(
  env: DatabaseEnv,
  academicPeriod: number,
  skipInvariants: readonly string[],
): Promise<TermReconcileResult> {
  const { semester } = academicPeriodInfo(academicPeriod);
  const startedAt = new Date();

  // allSettled, not all: if the calendar lookup fails while the CSV opened,
  // the CSV's download has to be cancelled, not left to the garbage collector.
  const [csvResult, partsResult] = await Promise.allSettled([
    fetchSemesterCsv(semester),
    fetchPartsOfTerm(academicPeriod),
  ]);
  if (csvResult.status === "rejected" || partsResult.status === "rejected") {
    if (csvResult.status === "fulfilled") await csvResult.value?.close();
    const error: unknown =
      csvResult.status === "rejected"
        ? csvResult.reason
        : (partsResult as PromiseRejectedResult).reason;
    // The registrar does not publish calendars indefinitely. A missing year
    // cannot heal on retry, so fail it now instead of running the same HTTP
    // request through every retry.
    if (error instanceof CalendarNotFoundError) {
      throw new FatalTermError(error.message);
    }
    throw error;
  }
  const csv = csvResult.value;
  const partOfTermRows = partsResult.value;

  try {
    // Deterministic, per-term failures: the registrar's CSV for this semester
    // is gone or now carries another term, or its parts-of-term calendar
    // resolved to zero rows. Retrying would re-fetch the same.
    if (!csv) {
      throw new FatalTermError(
        `No CSV rows available for academic period ${academicPeriod}`,
      );
    }
    if (csv.academicPeriod !== academicPeriod) {
      throw new FatalTermError(
        `${semester}.csv now carries ${csv.academicPeriod}, not ${academicPeriod}`,
      );
    }
    if (partOfTermRows.length === 0) {
      throw new FatalTermError(
        `No parts-of-term rows resolved for academic period ${academicPeriod}`,
      );
    }

    return await withScrapeDb(resolveDatabaseUrl(env), (db) =>
      reconcileTerm(
        {
          academicPeriod,
          description: csv.description,
          partOfTermRows,
          rows: csv.rows,
        },
        db,
        { startedAt, skipInvariants },
      ),
    );
  } catch (error) {
    // Re-running would read the same feed and break the same invariant.
    if (error instanceof InvariantViolationError) {
      throw new FatalTermError(error.message);
    }
    throw error;
  } finally {
    await csv?.close();
  }
}
