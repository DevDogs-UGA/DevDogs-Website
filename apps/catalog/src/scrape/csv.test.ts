import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { CsvRowParser, parseCsv, streamCsvRows } from "./csv";
import type { Row } from "./parsers/types";

/** What the scrape read before streaming: Papa with a header row, empty lines skipped. */
function papaRows(text: string): Row[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data.map((raw) => {
    const row: Row = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "__parsed_extra") continue;
      row[key] = value as string;
    }
    return row;
  });
}

/** Feeds `text` to a fresh parser cut at the given offsets. */
function parseChunked(text: string, cuts: number[]): Row[] {
  const parser = new CsvRowParser();
  const rows: Row[] = [];
  let from = 0;
  for (const cut of [...cuts, text.length]) {
    rows.push(...parser.push(text.slice(from, cut)));
    from = cut;
  }
  rows.push(...parser.end());
  return rows;
}

/** A small deterministic generator, so a failure replays. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const PIECES = [
  "a",
  "b",
  "CSCI 1301",
  " ",
  "",
  ",",
  '"',
  '""',
  "\n",
  "\r\n",
  "\r",
  "é",
  "日本",
  "a,b",
  'say "hi"',
  "line1\nline2",
];

function randomCsv(random: () => number): string {
  const eols = ["\n", "\r\n", "\r"];
  const eol = eols[Math.floor(random() * eols.length)]!;
  const columns = 1 + Math.floor(random() * 5);
  const lines: string[] = [];
  lines.push(Array.from({ length: columns }, (_, i) => `h${i}`).join(","));
  const records = Math.floor(random() * 6);
  for (let r = 0; r < records; r += 1) {
    // Usually the header's width, sometimes shorter or longer.
    const width = Math.max(
      1,
      random() < 0.8 ? columns : columns + Math.floor(random() * 3) - 1,
    );
    const fields: string[] = [];
    for (let f = 0; f < width; f += 1) {
      const count = Math.floor(random() * 3);
      let value = "";
      for (let p = 0; p < count; p += 1) {
        value += PIECES[Math.floor(random() * PIECES.length)]!;
      }
      const needsQuote = /[",\r\n]/.test(value) || random() < 0.3;
      fields.push(needsQuote ? `"${value.replaceAll('"', '""')}"` : value);
    }
    lines.push(fields.join(","));
    if (random() < 0.1) lines.push("");
  }
  const trailing = random() < 0.5 ? eol : "";
  return lines.join(eol) + trailing;
}

describe("CsvRowParser", () => {
  it("reads a header, quoted commas, doubled quotes and embedded newlines", () => {
    const text =
      'Term,Title,Note\n202702,"Intro, Part 1","say ""hi"""\n202702,Lab,"two\nlines"\n';
    expect(parseCsv(text)).toEqual([
      { Term: "202702", Title: "Intro, Part 1", Note: 'say "hi"' },
      { Term: "202702", Title: "Lab", Note: "two\nlines" },
    ]);
  });

  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ])("accepts %s line ends, with and without a final one", (_name, eol) => {
    const body = ["a,b", "1,2", "3,4"].join(eol);
    expect(parseCsv(body)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
    expect(parseCsv(body + eol)).toEqual(parseCsv(body));
  });

  it("skips empty lines and a byte order mark", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n\n\n3,4\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("keeps an empty quoted field and a trailing empty field", () => {
    expect(parseCsv('a,b,c\n"",x,\n')).toEqual([{ a: "", b: "x", c: "" }]);
  });

  it("leaves out missing keys and drops extra fields", () => {
    expect(parseCsv("a,b,c\n1,2\n1,2,3,4\n")).toEqual([
      { a: "1", b: "2" },
      { a: "1", b: "2", c: "3" },
    ]);
  });

  it("flushes a final record with no newline, including one that ends on a closing quote", () => {
    expect(parseCsv('a,b\n1,"x"')).toEqual([{ a: "1", b: "x" }]);
  });

  describe("chunk boundaries", () => {
    const cases: [string, string][] = [
      ["a quote that may close or double", 'a,b\n"x""y","z"\n1,2\n'],
      ["a CRLF split between chunks", "a,b\r\n1,2\r\n3,4\r\n"],
      ["a CR followed by a record", "a,b\r1,2\r3,4\r"],
      ["a newline inside quotes", 'a,b\n"l1\r\nl2",x\n'],
    ];

    it.each(cases)("%s, cut at every offset", (_name, text) => {
      const expected = papaRows(text);
      for (let cut = 0; cut <= text.length; cut += 1) {
        expect(parseChunked(text, [cut])).toEqual(expected);
      }
    });

    it.each(cases)("%s, one character at a time", (_name, text) => {
      const everyOffset = Array.from({ length: text.length }, (_, i) => i);
      expect(parseChunked(text, everyOffset)).toEqual(papaRows(text));
    });
  });

  it("matches Papa on randomly generated files cut at random places", () => {
    const random = rng(0xc5f);
    for (let run = 0; run < 3000; run += 1) {
      const text = randomCsv(random);
      const cuts = Array.from({ length: Math.floor(random() * 6) }, () =>
        Math.floor(random() * (text.length + 1)),
      ).sort((a, b) => a - b);
      const actual = parseChunked(text, cuts);
      const expected = papaRows(text);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `run ${run} differs from Papa\ntext: ${JSON.stringify(text)}\ncuts: ${cuts.join(",")}\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`,
        );
      }
    }
  });
});

describe("streamCsvRows", () => {
  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  async function collect(body: ReadableStream<Uint8Array>): Promise<Row[]> {
    const rows: Row[] = [];
    for await (const row of streamCsvRows(body)) rows.push(row);
    return rows;
  }

  it("decodes a multi-byte character split across network chunks", async () => {
    const bytes = new TextEncoder().encode('name,city\n"Café 日本",Athens\n');
    const expected = [{ name: "Café 日本", city: "Athens" }];
    // Every two-way split, so each multi-byte sequence is cut mid-character.
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const rows = await collect(
        streamOf([bytes.slice(0, cut), bytes.slice(cut)]),
      );
      expect(rows).toEqual(expected);
    }
  });

  it("matches Papa on generated files delivered in uneven byte chunks", async () => {
    const random = rng(7);
    for (let run = 0; run < 200; run += 1) {
      const text = randomCsv(random);
      const bytes = new TextEncoder().encode(text);
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < bytes.length;) {
        const size = 1 + Math.floor(random() * 9);
        chunks.push(bytes.slice(at, at + size));
        at += size;
      }
      expect(await collect(streamOf(chunks))).toEqual(papaRows(text));
    }
  });

  it("stops reading when the consumer breaks out", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("a\n1\n2\n3\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const row of streamCsvRows(body)) {
      expect(row).toEqual({ a: "1" });
      break;
    }
    expect(cancelled).toBe(true);
  });
});
