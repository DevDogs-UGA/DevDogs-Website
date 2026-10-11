/**
 * Writes the building dataset's addresses and coordinates into a database
 * (`pnpm populate:buildings`), the way the scrape's first step does in the
 * Worker, from the files on disk.
 *
 *   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm populate:buildings
 *
 * Idempotent: a row that already holds the same values is not rewritten.
 */
import { createScrapeDb } from "../src/db/client.ts";
import {
  buildingsToImport,
  importBuildings,
} from "../src/buildings/importBuildings.ts";
import { loadBuildingSources } from "./building-sources.ts";

const url = process.env.DB_URL;
if (!url) {
  console.error("DB_URL is not set.");
  process.exit(2);
}

const records = buildingsToImport(loadBuildingSources());
const db = createScrapeDb(url, 1);
try {
  console.log(JSON.stringify(await importBuildings(db, records)));
} finally {
  await db.$client.end({ timeout: 5 });
}
