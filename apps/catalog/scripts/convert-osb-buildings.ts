/**
 * One-off: turns the building data compiled for the Optimal Schedule Builder
 * into the CSV files in `data/buildings/`. Kept in the repo as the record of how
 * the files were made, and to redo it if the source ever changes.
 *
 *   tsx scripts/convert-osb-buildings.ts <path to a clone of DevDogsUGA/Optimal-Schedule-Builder>
 *
 * Source (all credit to ArshadRM, who got the real data in commit 1b469a46,
 * 2025-02-11, "Got the real building data as referenced from #482"):
 *
 * - `services/course-information/src/main/resources/buildingData/AthensBuildingData.json`
 *   is Athens as the OSB's course-information service shipped it (it fixed the
 *   duplicate rows the first copy had).
 * - `algorithm-prototyping/.../buildingData/GriffinBuildingData.json` and
 *   `TiftonBuildingData.json` are the other two campuses.
 *
 * Rules, each one a thing the source needed:
 *
 * - `Building Code` is a zero-padded string in the Athens file and a number in
 *   the others. The registrar's own value goes through `parseInt` (the scraper
 *   does, and `buildings.id` is an integer), so `"0024"` becomes `24`.
 * - `NCRR` and `TBA` are placeholders, not buildings: dropped.
 * - Identical repeated entries collapse to one (1030, 1671, 2219).
 * - Two different entries for one code (24, Meigs Hall): the first one has the
 *   coordinates of Holmes/Hunter Academic Building (0120), a copy-paste slip, so
 *   the one with coordinates of its own is kept.
 * - Entries in the Athens file with coordinates in Tifton (1641 and 1642, the
 *   Physical Plant buildings) are filed under `tifton`, where they are.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAMPUSES, type BuildingRecord } from "../src/buildings/dataset.ts";

type Source = {
  Address: string;
  Name: string;
  Longitude: number;
  Latitude: number;
  "Building Code": string | number;
};

const root = process.argv[2];
if (!root) {
  console.error(
    "usage: tsx scripts/convert-osb-buildings.ts <OSB clone>",
  );
  process.exit(2);
}

const out = resolve(import.meta.dirname, "..", "data", "buildings");
mkdirSync(out, { recursive: true });

function read(path: string): Source[] {
  // The source has a trailing space after one number ("33.95143912, "), which
  // JSON allows.
  return JSON.parse(readFileSync(join(root!, path), "utf8")) as Source[];
}

function csvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function inBox(campus: string, lat: number, lon: number): boolean {
  const box = CAMPUSES[campus]!;
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

function toRecords(entries: Source[], defaultCampus: string): BuildingRecord[] {
  const byId = new Map<number, Source[]>();
  for (const entry of entries) {
    const code = String(entry["Building Code"]).trim();
    if (!/^\d+$/.test(code)) continue;
    const id = parseInt(code, 10);
    byId.set(id, [...(byId.get(id) ?? []), entry]);
  }

  const coordinateOwners = new Map<string, Set<number>>();
  for (const [id, list] of byId) {
    for (const e of list) {
      const key = `${e.Latitude},${e.Longitude}`;
      coordinateOwners.set(key, (coordinateOwners.get(key) ?? new Set()).add(id));
    }
  }

  const records: BuildingRecord[] = [];
  for (const [id, list] of [...byId].sort((a, b) => a[0] - b[0])) {
    const distinct = [
      ...new Map(list.map((e) => [`${e.Latitude},${e.Longitude}`, e])).values(),
    ];
    let chosen = distinct[0]!;
    if (distinct.length > 1) {
      const own = distinct.filter(
        (e) => (coordinateOwners.get(`${e.Latitude},${e.Longitude}`)?.size ?? 0) === 1,
      );
      chosen = own[0] ?? chosen;
      console.error(
        `id ${id}: ${distinct.length} different entries, kept ${chosen.Address} (${chosen.Latitude}, ${chosen.Longitude})`,
      );
    }
    const campus = inBox(defaultCampus, chosen.Latitude, chosen.Longitude)
      ? defaultCampus
      : (["athens", "griffin", "tifton"].find((c) =>
          inBox(c, chosen.Latitude, chosen.Longitude),
        ) ?? defaultCampus);
    if (campus !== defaultCampus) {
      console.error(`id ${id}: coordinates are in ${campus}, filed there`);
    }
    records.push({
      id,
      campus,
      name: chosen.Name.trim(),
      address: chosen.Address.trim() || null,
      latitude: chosen.Latitude,
      longitude: chosen.Longitude,
    });
  }
  return records;
}

const athensAll = toRecords(
  read("services/course-information/src/main/resources/buildingData/AthensBuildingData.json"),
  "athens",
);
const griffin = toRecords(
  read("algorithm-prototyping/src/main/resources/buildingData/GriffinBuildingData.json"),
  "griffin",
);
const tifton = toRecords(
  read("algorithm-prototyping/src/main/resources/buildingData/TiftonBuildingData.json"),
  "tifton",
);

// The Athens file's two Tifton entries go with Tifton.
const athens = athensAll.filter((r) => r.campus === "athens");
const tiftonAll = [...tifton, ...athensAll.filter((r) => r.campus === "tifton")].sort(
  (a, b) => a.id - b.id,
);

const header = "id,campus,name,address,latitude,longitude\n";
function write(name: string, records: BuildingRecord[]): void {
  const body = records
    .map((r) =>
      [r.id, r.campus, r.name, r.address, r.latitude, r.longitude]
        .map((v) => csvField(v))
        .join(","),
    )
    .join("\n");
  writeFileSync(join(out, name), `${header}${body}\n`);
  console.error(`${name}: ${records.length} buildings`);
}

write("athens.csv", athens);
write("griffin.csv", griffin);
write("tifton.csv", tiftonAll);
