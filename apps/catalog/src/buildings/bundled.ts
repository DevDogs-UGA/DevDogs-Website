import type { ScrapeDb } from "~/db/client";
import {
  BUILDING_FILES,
  DATASET_FILES,
  REGISTRAR_BUILDINGS_CSV,
} from "./files";
import {
  buildingsToImport,
  importBuildings,
  type BuildingImportResult,
} from "./importBuildings";

/**
 * Imports the building data the Worker ships. Separate from `importBuildings.ts`
 * because `files.ts` imports `.csv` modules, which a bundler or Vitest handles
 * but a plain Node script (scripts/import-buildings.ts) cannot load.
 */
export function importBundledBuildings(
  db: ScrapeDb,
): Promise<BuildingImportResult> {
  return importBuildings(
    db,
    buildingsToImport({
      files: BUILDING_FILES,
      datasetFiles: DATASET_FILES,
      registrarCsv: REGISTRAR_BUILDINGS_CSV,
    }),
  );
}
