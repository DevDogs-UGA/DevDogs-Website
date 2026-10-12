import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BuildingSources } from "../src/buildings/importBuildings.ts";

const dataDir = resolve(import.meta.dirname, "..", "data", "buildings");
const DATASETS = ["athens.csv", "griffin.csv", "tifton.csv"];

/**
 * The building data read from `data/buildings/` on disk, in the shape the
 * Worker gets from its bundled modules (src/buildings/files.ts). For scripts
 * run under Node, which cannot import `.csv` modules.
 */
export function loadBuildingSources(): BuildingSources {
  const read = (name: string) => readFileSync(join(dataDir, name), "utf8");
  const gaps = existsSync(join(dataDir, "gaps"))
    ? readdirSync(join(dataDir, "gaps"))
        .filter((f) => f.endsWith(".csv"))
        .sort()
        .map((f) => `gaps/${f}`)
    : [];
  const datasetFiles = Object.fromEntries(DATASETS.map((f) => [f, read(f)]));
  return {
    files: {
      ...datasetFiles,
      ...Object.fromEntries(gaps.map((f) => [f, read(f)])),
    },
    datasetFiles,
    registrarCsv: read("registrar-buildings.csv"),
  };
}
