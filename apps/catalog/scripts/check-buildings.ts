/**
 * The CI check on the building data (`pnpm check:buildings`, run by CI):
 *
 * - every id exists: in a gap file it is one the registrar uses (`registrar-buildings.csv`),
 * - every point is inside the bounding box of its campus,
 * - no id twice, in one file or across files,
 * - the rows are well formed (an integer id, a known campus, both coordinates
 *   or neither, and no empty point in the main datasets),
 * - every CSV in `data/buildings/` is bundled by `src/buildings/files.ts`,
 *   so a file that passes here is a file the Worker imports.
 *
 * Prints the coverage figure too: how many of the registrar's buildings, and of
 * their meetings, now have a point.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseBuildingCsv,
  validateBuildings,
  type BuildingProblem,
  type ParsedBuildingFile,
} from "../src/buildings/dataset.ts";

const DATASETS = ["athens.csv", "griffin.csv", "tifton.csv"];
const REGISTRAR = "registrar-buildings.csv";

export type BuildingCheck = {
  problems: string[];
  files: ParsedBuildingFile[];
  coverage: {
    registrarBuildings: number;
    placedBuildings: number;
    registrarMeetings: number;
    placedMeetings: number;
  };
};

/** Reads `data/buildings/` under `dataDir` and checks it against the bundle list in `filesTs`. */
export function checkBuildingData(
  dataDir: string,
  filesTs: string,
): BuildingCheck {
  const problems: string[] = [];

  const onDisk = [
    ...DATASETS,
    ...(existsSync(join(dataDir, "gaps"))
      ? readdirSync(join(dataDir, "gaps"))
          .filter((f) => f.endsWith(".csv"))
          .sort()
          .map((f) => `gaps/${f}`)
      : []),
  ];

  const bundled = new Set(
    [...filesTs.matchAll(/data\/buildings\/([\w./-]+\.csv)/g)].map(
      (m) => m[1]!,
    ),
  );
  for (const file of [...onDisk, REGISTRAR]) {
    if (!bundled.has(file)) {
      problems.push(
        `data/buildings/${file} is not bundled: add its import and entry to src/buildings/files.ts.`,
      );
    }
  }
  for (const file of bundled) {
    if (![...onDisk, REGISTRAR].includes(file)) {
      problems.push(
        `src/buildings/files.ts imports data/buildings/${file}, which does not exist.`,
      );
    }
  }

  const registrar = parseBuildingCsv(
    REGISTRAR,
    readFileSync(join(dataDir, REGISTRAR), "utf8"),
  );
  const registrarMeetings = new Map<number, number>();
  const registrarRows = parseRegistrarMeetings(join(dataDir, REGISTRAR));
  for (const [id, meetings] of registrarRows)
    registrarMeetings.set(id, meetings);
  const knownIds = new Set(registrar.records.map((r) => r.record.id));
  for (const p of registrar.problems) problems.push(formatProblem(p));

  const files = onDisk.map((file) =>
    parseBuildingCsv(file, readFileSync(join(dataDir, file), "utf8")),
  );
  for (const p of validateBuildings(files, {
    knownIds,
    requireKnownId: (file) => !DATASETS.includes(file),
    allowEmptyCoordinates: (file) => !DATASETS.includes(file),
  })) {
    problems.push(formatProblem(p));
  }

  const placed = new Set(
    files.flatMap((f) =>
      f.records
        .filter(
          ({ record }) => record.latitude !== null && record.longitude !== null,
        )
        .map(({ record }) => record.id),
    ),
  );
  const placedKnown = [...knownIds].filter((id) => placed.has(id));
  return {
    problems,
    files,
    coverage: {
      registrarBuildings: knownIds.size,
      placedBuildings: placedKnown.length,
      registrarMeetings: [...registrarMeetings.values()].reduce(
        (a, b) => a + b,
        0,
      ),
      placedMeetings: placedKnown.reduce(
        (n, id) => n + (registrarMeetings.get(id) ?? 0),
        0,
      ),
    },
  };
}

function formatProblem(p: BuildingProblem): string {
  return `data/buildings/${p.file}:${p.line}${p.id === null ? "" : ` (id ${p.id})`} ${p.message}`;
}

/** The `meetings` column of registrar-buildings.csv, by id (it is an extra column the shared parser ignores). */
function parseRegistrarMeetings(path: string): Map<number, number> {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const columns = header!.split(",");
  const idAt = columns.indexOf("id");
  const meetingsAt = columns.indexOf("meetings");
  const map = new Map<number, number>();
  for (const line of lines) {
    // Names may be quoted and contain commas; id is first and meetings is
    // followed only by `terms`, so count from the ends.
    const parts = line.split(",");
    const id = Number(parts[idAt]);
    const meetings = Number(
      parts[parts.length - (columns.length - meetingsAt)],
    );
    if (Number.isInteger(id))
      map.set(id, Number.isFinite(meetings) ? meetings : 0);
  }
  return map;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = resolve(import.meta.dirname, "..");
  const result = checkBuildingData(
    join(root, "data", "buildings"),
    readFileSync(join(root, "src", "buildings", "files.ts"), "utf8"),
  );
  const c = result.coverage;
  const pct = (a: number, b: number) =>
    b === 0 ? "n/a" : `${((a / b) * 100).toFixed(1)}%`;
  console.log(
    `buildings with a point: ${c.placedBuildings} of ${c.registrarBuildings} (${pct(c.placedBuildings, c.registrarBuildings)}); ` +
      `meetings in them: ${c.placedMeetings} of ${c.registrarMeetings} (${pct(c.placedMeetings, c.registrarMeetings)})`,
  );
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(problem);
    console.error(`\n${result.problems.length} problem(s) in data/buildings/`);
    process.exit(1);
  }
  console.log("data/buildings/ is valid");
}
