import { CsvRowParser } from "../scrape/csv";

/**
 * The building coordinates dataset: parsing and validation, with no I/O, so the
 * Worker's import step, the CI check and the scripts all read it the same way.
 *
 * The data is in `apps/catalog/data/buildings/` as CSV, one row per building:
 *
 * | column | |
 * |---|---|
 * | `id` | The registrar's building number as an integer: `0024` is `24`. It is `buildings.id`. |
 * | `campus` | Which campus the point is on, one of {@link CAMPUSES}. |
 * | `name` | What the dataset calls it. |
 * | `address` | Street address, may be empty. |
 * | `latitude`, `longitude` | Decimal degrees. Empty only in a gap file, for a member to fill. |
 *
 * Extra columns are ignored, so a gap file can carry the registrar's name and
 * the number of meetings as hints.
 */

export type Campus = {
  /** South, north, west, east edges in decimal degrees: a point outside is a typo. */
  south: number;
  north: number;
  west: number;
  east: number;
};

/**
 * The bounding box each campus's points must fall in. Athens is the plan's "Athens
 * bounding box", about 20 km across, wide enough for the Atlanta Highway
 * warehouses and the outlying farms; the
 * others exist because UGA's registrar lists buildings at every campus it has,
 * and a point is checked against the box of the campus it claims.
 */
export const CAMPUSES: Readonly<Record<string, Campus>> = {
  athens: { south: 33.88, north: 34.02, west: -83.52, east: -83.28 },
  griffin: { south: 33.2, north: 33.32, west: -84.34, east: -84.24 },
  tifton: { south: 31.42, north: 31.54, west: -83.58, east: -83.46 },
  gwinnett: { south: 33.94, north: 34.08, west: -84.08, east: -83.9 },
  atlanta: { south: 33.6, north: 34.05, west: -84.6, east: -84.2 },
  skidaway: { south: 31.9, north: 32.1, west: -81.15, east: -80.95 },
  // Anything else in the state: the registrar has buildings at 4-H centers,
  // research farms and extension offices across Georgia.
  georgia: { south: 30.3, north: 35.1, west: -85.7, east: -80.8 },
};

export type BuildingRecord = {
  id: number;
  campus: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type BuildingProblem = {
  file: string;
  /** 1-based line in the file, the header being line 1. */
  line: number;
  id: number | null;
  message: string;
};

export type ParsedBuildingFile = {
  file: string;
  records: { line: number; record: BuildingRecord }[];
  problems: BuildingProblem[];
};

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Parses one building CSV. Structural problems (a bad id, an unreadable number) are returned, not thrown. */
export function parseBuildingCsv(
  file: string,
  text: string,
): ParsedBuildingFile {
  const parser = new CsvRowParser();
  const rows = [...parser.push(text), ...parser.end()];
  const records: ParsedBuildingFile["records"] = [];
  const problems: BuildingProblem[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const idText = (row.id ?? "").trim();
    const id = /^\d+$/.test(idText) ? Number(idText) : null;
    if (id === null || id <= 0) {
      problems.push({
        file,
        line,
        id: null,
        message: `id "${idText}" is not a positive integer (write 24, not 0024).`,
      });
      return;
    }
    const latitude = parseNumber(row.latitude ?? "");
    const longitude = parseNumber(row.longitude ?? "");
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      problems.push({
        file,
        line,
        id,
        message: "latitude and longitude must be decimal numbers.",
      });
      return;
    }
    records.push({
      line,
      record: {
        id,
        campus: (row.campus ?? "").trim().toLowerCase(),
        name: (row.name ?? "").trim(),
        address: (row.address ?? "").trim() || null,
        latitude,
        longitude,
      },
    });
  });

  return { file, records, problems };
}

export type ValidateOptions = {
  /** Building ids the registrar uses, from `registrar-buildings.csv`. */
  knownIds: ReadonlySet<number>;
  /**
   * Whether a file's ids must be ones the registrar uses. True for the gap
   * files, which members edit: a typo there would add a building nothing
   * refers to. False for the credited datasets, which cover about 270
   * buildings, including ones the registrar does not use today but may.
   */
  requireKnownId: (file: string) => boolean;
  /** Gap files may leave coordinates empty; the main datasets may not. */
  allowEmptyCoordinates: (file: string) => boolean;
};

/**
 * The CI check on the data, over every file at once:
 *
 * 1. the id exists (in a member-edited file it must be one the registrar uses,
 *    so a typo cannot add a ghost building),
 * 2. the point is inside the bounding box of the campus it names,
 * 3. no id appears twice, within a file or across files.
 *
 * Plus the shape: a campus we know, and both coordinates or neither.
 */
export function validateBuildings(
  files: readonly ParsedBuildingFile[],
  options: ValidateOptions,
): BuildingProblem[] {
  const problems: BuildingProblem[] = files.flatMap((f) => f.problems);
  const seen = new Map<number, { file: string; line: number }>();

  for (const { file, records } of files) {
    for (const { line, record } of records) {
      const at = { file, line, id: record.id };

      if (options.requireKnownId(file) && !options.knownIds.has(record.id)) {
        problems.push({
          ...at,
          message: `id ${record.id} is not a building the registrar uses (see registrar-buildings.csv).`,
        });
      }

      const first = seen.get(record.id);
      if (first) {
        problems.push({
          ...at,
          message: `id ${record.id} is already in ${first.file} line ${first.line}.`,
        });
      } else {
        seen.set(record.id, { file, line });
      }

      const campus = CAMPUSES[record.campus];
      if (!campus) {
        problems.push({
          ...at,
          message: `campus "${record.campus}" is not one of ${Object.keys(CAMPUSES).join(", ")}.`,
        });
      }

      const { latitude, longitude } = record;
      if (latitude === null && longitude === null) {
        if (!options.allowEmptyCoordinates(file)) {
          problems.push({
            ...at,
            message: "latitude and longitude are empty.",
          });
        }
      } else if (latitude === null || longitude === null) {
        problems.push({
          ...at,
          message: "give both latitude and longitude, or neither.",
        });
      } else if (campus) {
        const inside =
          latitude >= campus.south &&
          latitude <= campus.north &&
          longitude >= campus.west &&
          longitude <= campus.east;
        if (!inside) {
          problems.push({
            ...at,
            message: `(${latitude}, ${longitude}) is outside the ${record.campus} bounding box (lat ${campus.south} to ${campus.north}, lon ${campus.west} to ${campus.east}). Latitude first, and longitude is negative in Georgia.`,
          });
        }
      }
    }
  }

  return problems;
}

/** Every record with coordinates across the files, in file order. Later files do not override earlier ones: validation already rejects a repeated id. */
export function placedBuildings(
  files: readonly ParsedBuildingFile[],
): BuildingRecord[] {
  return files.flatMap((f) =>
    f.records
      .map((r) => r.record)
      .filter((r) => r.latitude !== null && r.longitude !== null),
  );
}
