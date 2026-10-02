/**
 * The shapes an export can be written in. Every export has the platform's own
 * CSV; attendance can also be written for the two places DevDogs reports an
 * event's attendance to:
 *
 * - `bevy`: GDG's Bevy attendee import (gdg.community.dev, an event's
 *   Registrations, "Import attendees"), its template's fixed columns with
 *   `checked_in` TRUE. The template's `survey:` columns differ per event and
 *   are left off.
 * - `involvement`: the UGA Involvement Network's attendance upload, one MyID
 *   email per line and nothing else.
 *
 * Both are one line per person, not per check-in, and only make sense for one
 * event, so they need `--meeting`.
 */
import { csvRow, LINE_ENDING } from "../csv/write.js";

export const ATTENDANCE_FORMATS = ["platform", "bevy", "involvement"] as const;
export type FormatName = (typeof ATTENDANCE_FORMATS)[number];

export type Row = Record<string, unknown>;

/** Writes one file's rows; a fresh one per file, since it remembers who it wrote. */
export interface FormatWriter {
  /** The text for one page of rows, and how many lines that was. */
  page: (rows: readonly Row[]) => { text: string; count: number };
  /** People left out (no address the format can use). */
  skipped: () => number;
}

export interface Format {
  name: FormatName;
  label: string;
  hint: string;
  /** Added to the default file name, after the filters. */
  suffix: string;
  extension: "csv" | "txt";
  /** Whether the file opens with a UTF-8 byte-order mark (for Excel). */
  bom: boolean;
  /** One event's attendance: needs `--meeting`. */
  perEvent: boolean;
  /** What one line is, for "Wrote 3 …". */
  unit: [one: string, many: string];
  /** What a skipped attendee had no copy of, for the warning. */
  needs: string;
  /** The header line, if any. */
  head: string;
  writer: () => FormatWriter;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The UGA address on file: the profile's MyID email, else a uga.edu sign-in. */
export function ugaEmail(row: Row): string | null {
  const uga = text(row.uga_email).toLowerCase();
  if (uga) return uga;
  const signIn = text(row.email).toLowerCase();
  return signIn.endsWith("@uga.edu") ? signIn : null;
}

/**
 * First and last name: the roster's (or legal) name when the profile has
 * one, else the preferred name split at its first space.
 */
export function splitName(row: Row): [first: string, last: string] {
  const first = text(row.first_name);
  const last = text(row.last_name);
  if (first || last) return [first, last];
  const preferred = text(row.preferred_name);
  const space = preferred.indexOf(" ");
  return space === -1
    ? [preferred, ""]
    : [preferred.slice(0, space), preferred.slice(space + 1).trim()];
}

/** One line per new key; rows without a key are counted as skipped. */
function oncePer(
  key: (row: Row) => string | null,
  line: (row: Row, key: string) => string,
): FormatWriter {
  const seen = new Set<string>();
  const skipped = new Set<string>();
  return {
    page: (rows) => {
      let out = "";
      let count = 0;
      for (const row of rows) {
        const k = key(row);
        if (k === null) {
          skipped.add(text(row.user_id));
          continue;
        }
        if (seen.has(k)) continue;
        seen.add(k);
        out += line(row, k);
        count++;
      }
      return { text: out, count };
    },
    skipped: () => skipped.size,
  };
}

export const BEVY_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "checked_in",
  "job_title",
  "company",
  "ticket_title",
  "ticket_venue",
] as const;

/** The platform's CSV for an export: its columns, a row per row. */
export function platformFormat(columns: readonly string[]): Format {
  return {
    name: "platform",
    label: "Platform CSV",
    hint: "every column, one row per record",
    suffix: "",
    extension: "csv",
    bom: true,
    perEvent: false,
    unit: ["row", "rows"],
    needs: "",
    head: csvRow(columns),
    writer: () => ({
      page: (rows) => ({
        text: rows.map((row) => csvRow(columns.map((c) => row[c]))).join(""),
        count: rows.length,
      }),
      skipped: () => 0,
    }),
  };
}

export const BEVY: Format = {
  name: "bevy",
  label: "Bevy attendee import",
  hint: "gdg.community.dev; one row per person, checked in",
  suffix: "bevy",
  extension: "csv",
  bom: false,
  perEvent: true,
  unit: ["person", "people"],
  needs: "an email",
  head: csvRow(BEVY_COLUMNS),
  writer: () =>
    oncePer(
      (row) => (ugaEmail(row) ?? text(row.email).toLowerCase()) || null,
      (row, email) => {
        const [first, last] = splitName(row);
        return csvRow([first, last, email, "TRUE", "", "", "", ""]);
      },
    ),
};

export const INVOLVEMENT: Format = {
  name: "involvement",
  label: "Involvement Network list",
  hint: "one MyID email per line",
  suffix: "involvement",
  extension: "txt",
  bom: false,
  perEvent: true,
  unit: ["email", "emails"],
  needs: "a UGA email",
  head: "",
  writer: () => oncePer(ugaEmail, (_row, email) => `${email}${LINE_ENDING}`),
};

export function formatFor(
  name: FormatName,
  columns: readonly string[],
): Format {
  if (name === "bevy") return BEVY;
  if (name === "involvement") return INVOLVEMENT;
  return platformFormat(columns);
}

/** `--format` values, comma-separated or repeated, checked and deduplicated. */
export function parseFormats(raw: readonly string[]): FormatName[] {
  const names = raw
    .flatMap((r) => r.split(","))
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  for (const name of names) {
    if (!(ATTENDANCE_FORMATS as readonly string[]).includes(name)) {
      throw new Error(
        `Unknown format "${name}". Try ${ATTENDANCE_FORMATS.join(", ")}.`,
      );
    }
  }
  return [...new Set(names)] as FormatName[];
}
