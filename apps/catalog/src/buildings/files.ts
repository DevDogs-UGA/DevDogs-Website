/**
 * Every building data file the Worker ships, as text.
 *
 * wrangler.jsonc's `rules` bundle `*.csv` as text modules, and
 * vitest.config.ts has a plugin that does the same under test. A bundler cannot
 * glob a folder, so a new file in `data/buildings/gaps/` has to be listed here.
 * `pnpm check:buildings` fails with the line to add when one is not, which is
 * what CI runs.
 *
 * Order matters only for reading: validation rejects an id that appears twice.
 */
import athens from "../../data/buildings/athens.csv";
import griffin from "../../data/buildings/griffin.csv";
import tifton from "../../data/buildings/tifton.csv";
import gap001 from "../../data/buildings/gaps/gap-001.csv";
import gap002 from "../../data/buildings/gaps/gap-002.csv";
import registrar from "../../data/buildings/registrar-buildings.csv";

/** The datasets: complete rows, a point for every building. */
export const DATASET_FILES: Readonly<Record<string, string>> = {
  "athens.csv": athens,
  "griffin.csv": griffin,
  "tifton.csv": tifton,
};

/** The gap files, `gaps/gap-NNN.csv`: a member fills in the point. Rows still empty are skipped. */
export const GAP_FILES: Readonly<Record<string, string>> = {
  "gaps/gap-001.csv": gap001,
  "gaps/gap-002.csv": gap002,
};

/** Every building number the registrar's schedule files use. */
export const REGISTRAR_BUILDINGS_CSV: string = registrar;

export const BUILDING_FILES: Readonly<Record<string, string>> = {
  ...DATASET_FILES,
  ...GAP_FILES,
};
