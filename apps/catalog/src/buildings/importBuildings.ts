import { sql } from "drizzle-orm";
import type { ScrapeDb } from "~/db/client";
import {
  parseBuildingCsv,
  placedBuildings,
  validateBuildings,
  type BuildingRecord,
} from "./dataset";

/** Where the building data comes from: file name to CSV text, as `files.ts` bundles it or a script reads it from disk. */
export type BuildingSources = {
  /** Every dataset and gap file. */
  files: Readonly<Record<string, string>>;
  /** The complete datasets (`athens.csv`...); gap files are the rest. */
  datasetFiles: Readonly<Record<string, string>>;
  /** `registrar-buildings.csv`: every building number the registrar uses. */
  registrarCsv: string;
};

/** The ids the registrar uses, from `registrar-buildings.csv`. */
export function registrarBuildingIds(csv: string): Set<number> {
  const ids = new Set<number>();
  for (const { record } of parseBuildingCsv("registrar-buildings.csv", csv)
    .records) {
    ids.add(record.id);
  }
  return ids;
}

/**
 * The buildings to write: every row that has a point, from every file. Throws if
 * the files do not validate, so a bad edit that slipped past CI cannot put a
 * building in the ocean; the scrape reports the error and carries on without
 * buildings (see ScrapeWorkflow).
 */
export function buildingsToImport(sources: BuildingSources): BuildingRecord[] {
  const parsed = Object.entries(sources.files).map(([name, text]) =>
    parseBuildingCsv(name, text),
  );
  const problems = validateBuildings(parsed, {
    knownIds: registrarBuildingIds(sources.registrarCsv),
    requireKnownId: (file) => !(file in sources.datasetFiles),
    allowEmptyCoordinates: (file) => !(file in sources.datasetFiles),
  });
  if (problems.length > 0) {
    throw new Error(
      `The building data does not validate (${problems.length} problems), first: ` +
        `${problems[0]!.file}:${problems[0]!.line} ${problems[0]!.message}`,
    );
  }
  return placedBuildings(parsed);
}

export type BuildingImportResult = {
  /** Rows in the dataset with a point. */
  placed: number;
  /** Rows the database did not have, inserted. */
  inserted: number;
  /** Rows whose address or point changed. */
  updated: number;
};

/**
 * Writes the dataset's addresses and coordinates into `schedule_builder.buildings`.
 *
 * An upsert by id that sets only `address`, `latitude` and `longitude`. The
 * registrar's `description` is the scrape's to keep fresh (BuildingCollector
 * overwrites it each run), and the scrape in turn never touches the three
 * columns written here, so the two cannot undo each other. A building the
 * database has not seen yet is inserted under the dataset's name, so its point
 * is there the first day the registrar uses it. Rows already holding the same
 * values are not rewritten.
 */
export async function importBuildings(
  db: ScrapeDb,
  records: readonly BuildingRecord[],
): Promise<BuildingImportResult> {
  if (records.length === 0) return { placed: 0, inserted: 0, updated: 0 };

  const rows = await db.execute<{ inserted: boolean }>(sql`
    insert into schedule_builder.buildings as b (id, description, address, latitude, longitude)
    select r.id, r.name, r.address, r.latitude, r.longitude
    from jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
      as r(id int, name text, address text, latitude double precision, longitude double precision)
    on conflict (id) do update
      set address = excluded.address,
          latitude = excluded.latitude,
          longitude = excluded.longitude
      where (b.address, b.latitude, b.longitude)
        is distinct from (excluded.address, excluded.latitude, excluded.longitude)
    returning (xmax = 0) as inserted
  `);
  const inserted = rows.filter((r) => r.inserted).length;
  return { placed: records.length, inserted, updated: rows.length - inserted };
}
