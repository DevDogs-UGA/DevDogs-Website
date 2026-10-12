/**
 * Refreshes the registrar's building list and the gap files in
 * `data/buildings/`.
 *
 *   tsx scripts/building-gaps.ts --dir <folder with spring.csv, summer.csv, fall.csv> [--download]
 *
 * `--download` fetches the three files from the registrar into the folder first.
 *
 * It writes:
 *
 * - `registrar-buildings.csv`: every building number the schedule files use,
 *   with the name the registrar gives it, the campus it mostly belongs to, how
 *   many meetings use it, and in which terms. CI uses it as the list of ids that
 *   exist (`check:buildings`), and it is the denominator of the coverage figure.
 * - `gaps/gap-NNN.csv`: the buildings with no coordinates yet, most-used first,
 *   15 to a file, ready for a member to fill in (one file is one starter issue).
 *   Existing files, filled or not, are never rewritten and their ids are never
 *   listed again; only buildings that are new to the data get new files.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { CsvRowParser } from "../src/scrape/csv.ts";
import { parseBuildingCsv } from "../src/buildings/dataset.ts";

const BATCH_SIZE = 15;
const SEMESTERS = ["spring", "summer", "fall"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = arg("--dir");
if (!dir) {
  console.error(
    "usage: tsx scripts/building-gaps.ts --dir <folder> [--download]",
  );
  process.exit(2);
}

const data = resolve(import.meta.dirname, "..", "data", "buildings");
const gapsDir = join(data, "gaps");
mkdirSync(dir, { recursive: true });
mkdirSync(gapsDir, { recursive: true });

if (process.argv.includes("--download")) {
  for (const semester of SEMESTERS) {
    const res = await fetch(`https://apps.reg.uga.edu/soc/${semester}.csv`);
    if (!res.ok) throw new Error(`${semester}.csv: HTTP ${res.status}`);
    writeFileSync(
      join(dir, `${semester}.csv`),
      new Uint8Array(await res.arrayBuffer()),
    );
  }
}

const CAMPUS_OF_REGISTRAR_CODE: Record<string, string> = {
  ATH: "athens",
  GRF: "griffin",
  TIF: "tifton",
  GWN: "gwinnett",
  BKH: "atlanta",
  KIO: "skidaway",
};

type Seen = {
  names: Map<string, number>;
  campuses: Map<string, number>;
  meetings: number;
  terms: Set<number>;
};
const buildings = new Map<number, Seen>();

for (const semester of SEMESTERS) {
  const parser = new CsvRowParser();
  const text = readFileSync(join(dir, `${semester}.csv`), "utf8");
  for (const row of [...parser.push(text), ...parser.end()]) {
    const raw = (row.Building ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    const id = parseInt(raw, 10);
    const seen = buildings.get(id) ?? {
      names: new Map(),
      campuses: new Map(),
      meetings: 0,
      terms: new Set<number>(),
    };
    const name = (row["MEETING_TIME.BUILDING_DESC"] ?? "").trim();
    if (name) seen.names.set(name, (seen.names.get(name) ?? 0) + 1);
    const code =
      (row["MEETING_TIME.COURSE_CAMPUS"] ?? "").trim() ||
      (row["SCHEDULE_OFFERING.CAMPUS"] ?? "").trim();
    const campus = CAMPUS_OF_REGISTRAR_CODE[code] ?? "georgia";
    seen.campuses.set(campus, (seen.campuses.get(campus) ?? 0) + 1);
    seen.meetings += 1;
    seen.terms.add(parseInt(row.ACADEMIC_PERIOD ?? "", 10));
    buildings.set(id, seen);
  }
}

function top(counts: Map<string, number>, fallback: string): string {
  return (
    [...counts].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? fallback
  );
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const registrar = [...buildings]
  .sort((a, b) => a[0] - b[0])
  .map(([id, seen]) => ({
    id,
    name: top(seen.names, ""),
    campus: top(seen.campuses, "georgia"),
    meetings: seen.meetings,
    terms: [...seen.terms].sort().join(" "),
  }));

writeFileSync(
  join(data, "registrar-buildings.csv"),
  "id,name,campus,meetings,terms\n" +
    registrar
      .map((r) =>
        [r.id, r.name, r.campus, r.meetings, r.terms].map(csvField).join(","),
      )
      .join("\n") +
    "\n",
);
console.error(`registrar-buildings.csv: ${registrar.length} buildings`);

// Ids already in some file: the datasets, and every gap file written so far.
const listed = new Set<number>();
const existingGaps = readdirSync(gapsDir)
  .filter((f) => /^gap-\d+\.csv$/.test(f))
  .sort();
for (const file of ["athens.csv", "griffin.csv", "tifton.csv"]) {
  for (const { record } of parseBuildingCsv(
    file,
    readFileSync(join(data, file), "utf8"),
  ).records) {
    listed.add(record.id);
  }
}
for (const file of existingGaps) {
  for (const { record } of parseBuildingCsv(
    file,
    readFileSync(join(gapsDir, file), "utf8"),
  ).records) {
    listed.add(record.id);
  }
}

const missing = registrar
  .filter((r) => !listed.has(r.id))
  .sort((a, b) => b.meetings - a.meetings || a.id - b.id);

let next =
  existingGaps.length === 0
    ? 1
    : Number(/gap-(\d+)/.exec(existingGaps.at(-1)!)![1]) + 1;
for (let i = 0; i < missing.length; i += BATCH_SIZE) {
  const batch = missing.slice(i, i + BATCH_SIZE);
  const name = `gap-${String(next).padStart(3, "0")}.csv`;
  next += 1;
  if (existsSync(join(gapsDir, name)))
    throw new Error(`${name} already exists`);
  writeFileSync(
    join(gapsDir, name),
    "id,campus,name,address,latitude,longitude,meetings\n" +
      batch
        .map((r) =>
          [r.id, r.campus, r.name, "", "", "", r.meetings]
            .map(csvField)
            .join(","),
        )
        .join("\n") +
      "\n",
  );
  console.error(
    `${name}: ${batch.length} buildings, ${batch.reduce((n, r) => n + r.meetings, 0)} meetings`,
  );
}
console.error(
  `${missing.length} buildings new to the data, in ${Math.ceil(missing.length / BATCH_SIZE)} new files`,
);
