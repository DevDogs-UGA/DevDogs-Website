import type { Row } from "./parsers/types";

/**
 * A streaming CSV reader for the registrar's schedule files.
 *
 * Why it exists: `Papa.parse` on a whole semester (7 MB, 20,000 rows of 55
 * columns) builds one object of 55 strings per row, about 120 MB of heap, and
 * a Worker isolate dies at 128 MB. The daily scrape hit exactly that ("Worker
 * exceeded memory limit", every day since the first Spring 2027 file). This
 * reader holds one row at a time, so the file's size no longer matters; what
 * the scrape keeps are the compact records its collectors build.
 *
 * Reads what Papa read with `{ header: true, skipEmptyLines: true }`: a header
 * row, then one object per record, quoted fields with `""` escapes and embedded
 * newlines, `\n`, `\r\n` or `\r` line ends, completely empty lines skipped. A
 * record with fewer fields than the header leaves the missing keys out; one
 * with more drops the extras. (Papa filed extras under `__parsed_extra`, which
 * nothing reads.) `csv.test.ts` pins this against Papa.
 */
export class CsvRowParser {
  private header: string[] | null = null;
  private record: string[] = [];
  private field = "";
  /** True once the current field has any character, or an opening quote. */
  private fieldStarted = false;
  private inQuotes = false;
  /** A `"` ended a chunk inside quotes: whether it closes the field or starts `""` depends on the next one. */
  private quotePending = false;
  /** A `\r` just ended a record: a following `\n` belongs to the same line end. */
  private afterCarriageReturn = false;
  private bomChecked = false;

  /** Feeds decoded text; returns the rows it completed. */
  push(chunk: string): Row[] {
    const rows: Row[] = [];
    let text = chunk;
    if (!this.bomChecked && text.length > 0) {
      this.bomChecked = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]!;

      if (this.quotePending) {
        this.quotePending = false;
        if (ch === '"') {
          this.field += '"';
          continue;
        }
        this.inQuotes = false;
        // Fall through: `ch` is what follows the closing quote.
      }

      if (this.inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length) {
            if (text[i + 1] === '"') {
              this.field += '"';
              i += 1;
            } else {
              this.inQuotes = false;
            }
          } else {
            this.quotePending = true;
          }
        } else {
          this.field += ch;
        }
        continue;
      }

      if (this.afterCarriageReturn) {
        this.afterCarriageReturn = false;
        if (ch === "\n") continue;
      }

      if (ch === '"' && !this.fieldStarted) {
        this.inQuotes = true;
        this.fieldStarted = true;
      } else if (ch === ",") {
        this.endField();
      } else if (ch === "\n") {
        this.endRecord(rows);
      } else if (ch === "\r") {
        this.endRecord(rows);
        this.afterCarriageReturn = true;
      } else {
        this.field += ch;
        this.fieldStarted = true;
      }
    }
    return rows;
  }

  /** Flushes a final record that has no trailing newline. */
  end(): Row[] {
    const rows: Row[] = [];
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
    }
    if (this.fieldStarted || this.record.length > 0 || this.field !== "") {
      this.endRecord(rows);
    }
    return rows;
  }

  private endField(): void {
    this.record.push(this.field);
    this.field = "";
    this.fieldStarted = false;
  }

  private endRecord(rows: Row[]): void {
    // A line with nothing on it is not a record (Papa's skipEmptyLines).
    const empty =
      this.record.length === 0 && this.field === "" && !this.fieldStarted;
    if (empty) return;
    this.endField();
    const values = this.record;
    this.record = [];

    if (this.header === null) {
      this.header = values;
      return;
    }
    const row: Row = {};
    const header = this.header;
    const count = Math.min(header.length, values.length);
    for (let i = 0; i < count; i += 1) row[header[i]!] = values[i]!;
    rows.push(row);
  }
}

/**
 * The rows of a CSV response body, one at a time, without ever holding the
 * file: each network chunk is decoded, parsed, and its rows yielded before the
 * next is read. Breaking out of the loop cancels the body.
 */
export async function* streamCsvRows(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Row, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = new CsvRowParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const row of parser.push(decoder.decode(value, { stream: true }))) {
        yield row;
      }
    }
    for (const row of parser.push(decoder.decode())) yield row;
    for (const row of parser.end()) yield row;
  } finally {
    // After a normal finish this is a no-op; after an early `break` it stops the download.
    await reader.cancel().catch(() => undefined);
  }
}

/** Parses a whole string. For tests and small inputs; the scrape streams. */
export function parseCsv(text: string): Row[] {
  const parser = new CsvRowParser();
  return [...parser.push(text), ...parser.end()];
}
