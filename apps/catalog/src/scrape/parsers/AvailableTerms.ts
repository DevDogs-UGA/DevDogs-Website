import { streamCsvRows } from "../csv";
import type { Row } from "./types";
import { academicPeriodInfo } from "./utils";

const SEMESTERS = ["spring", "summer", "fall"] as const;

/** A term the registrar publishes, without its rows. */
export type AvailableTerm = {
  academicPeriod: number;
  description: string;
};

/**
 * A term's CSV as a stream: the term it is for, and its rows one at a time.
 * Consume `rows` once. Stopping early (a `break`, or `rows.return()`) cancels
 * the download; so does `close()`.
 */
export type TermSource = AvailableTerm & {
  rows: AsyncGenerator<Row, void, undefined>;
  /** Stops the download without reading the rest. Safe to call after `rows` finished. */
  close(): Promise<void>;
};

export type FailedFetch = {
  semester: string;
  status?: number;
  error?: string;
};

export type AvailableTermsResult = {
  terms: AvailableTerm[];
  failedFetches: FailedFetch[];
};

/** Thrown by `fetchSemesterCsv` for a non-ok HTTP response, carrying the status. */
export class SemesterFetchError extends Error {
  constructor(
    readonly semester: string,
    readonly status: number,
  ) {
    super(`Failed to fetch ${semester}.csv: HTTP ${status}`);
    this.name = "SemesterFetchError";
  }
}

/**
 * Opens one semester's CSV as a stream.
 *
 * Throws (rather than returning a falsy value) on a non-ok response or a
 * network-level failure, so the caller can tell "this semester's fetch
 * failed" apart from "this semester's CSV had no usable ACADEMIC_PERIOD"
 * (returned as `null`): the registrar sometimes publishes an empty CSV ahead
 * of a term opening, which is not itself an error.
 *
 * The first row is read here, to learn the academic period, and handed back at
 * the head of `rows`; the rest is not read until the caller asks.
 */
export async function fetchSemesterCsv(
  semester: string,
): Promise<TermSource | null> {
  const res = await fetch(`https://apps.reg.uga.edu/soc/${semester}.csv`);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new SemesterFetchError(semester, res.status);
  }
  if (!res.body) return null;

  const rows = streamCsvRows(res.body as ReadableStream<Uint8Array>);
  const first = await rows.next();
  const academicPeriod = parseInt(
    first.done ? "" : (first.value.ACADEMIC_PERIOD ?? ""),
    10,
  );
  if (first.done || isNaN(academicPeriod)) {
    await rows.return();
    return null;
  }

  return {
    academicPeriod,
    description: academicPeriodInfo(academicPeriod).description,
    rows: (async function* () {
      yield first.value;
      yield* rows;
    })(),
    close: async () => {
      await rows.return();
    },
  };
}

// Mirrors the "Spring 2026 / Summer 2026 / Fall 2026" term-selector pills on
// https://reg.uga.edu/registration/schedule-of-classes/
// Those pills are populated by reading ACADEMIC_PERIOD off of these same
// three CSVs.
//
// A semester's fetch failing (non-ok response or a thrown network error) is
// surfaced in `failedFetches` rather than silently skipped: a renamed/moved
// CSV used to `continue` past this exact case and still return `ok: true`
// with the remaining terms, hiding the fact that a whole term went stale.
//
// Only the first row of each file is read, so this holds no semester in
// memory; each term's own step streams its file again.
export async function detectAvailableTerms(): Promise<AvailableTermsResult> {
  const terms: AvailableTerm[] = [];
  const failedFetches: FailedFetch[] = [];

  for (const semester of SEMESTERS) {
    try {
      const source = await fetchSemesterCsv(semester);
      if (source) {
        await source.close();
        terms.push({
          academicPeriod: source.academicPeriod,
          description: source.description,
        });
      }
    } catch (err) {
      failedFetches.push({
        semester,
        status: err instanceof SemesterFetchError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { terms, failedFetches };
}
