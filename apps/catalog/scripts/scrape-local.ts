/**
 * Runs the registrar scrape from the command line, against any database
 * (`pnpm populate:courses`): the same functions the ScrapeWorkflow steps call,
 * without the Workflows engine around them. It reads UGA's live feeds.
 *
 *   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     pnpm populate:courses [--terms 202702,202608] [--skip-invariants name,name] [--record]
 *
 * - `--terms` limits the run to those academic periods. Default: every term the
 *   registrar publishes.
 * - `--skip-invariants` waives the named invariants, as the Workflow's
 *   `skipInvariants` parameter does.
 * - `--record` writes the run to `uga."scrapeRuns"`, and the heartbeat when the
 *   run covered every term and was clean. Off by default: a local run should
 *   not move a database's heartbeat.
 *
 * Prints one JSON report to stdout (counts, every invariant, building coverage,
 * peak heap) and exits 1 when a term failed or an invariant did not hold.
 */
import { createScrapeDb, withScrapeDb } from "../src/db/client.ts";
import {
  buildingsToImport,
  importBuildings,
} from "../src/buildings/importBuildings.ts";
import {
  recordHeartbeat,
  recordRun,
  SCRAPE_HEARTBEAT_JOB,
} from "../src/scrape/heartbeat.ts";
import { detectAvailableTerms } from "../src/scrape/parsers/index.ts";
import type { TermReconcileResult } from "../src/scrape/parsers/reconcileTerm.ts";
import { reconcileOneTerm } from "../src/scrape/runTerm.ts";
import { loadBuildingSources } from "./building-sources.ts";

/** An error's message and its cause's: Drizzle wraps the driver's error and puts the whole statement in its own message. */
function describe(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const text =
    error instanceof Error ? error.message.slice(0, 200) : String(error);
  return cause instanceof Error
    ? `${text} ... caused by: ${cause.message}`
    : text;
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const url = process.env.DB_URL;
if (!url) {
  console.error("DB_URL is not set.");
  process.exit(2);
}
const only = option("--terms")?.split(",").map(Number);
const skipInvariants = option("--skip-invariants")?.split(",") ?? [];
const record = process.argv.includes("--record");
const env = { DEPLOY_ENV: "development", DB_URL: url };
const startedAt = new Date();

// The Worker has 128 MB for everything in its isolate, so the number that
// matters is what the JavaScript heap and its buffers peak at, not the Node
// process's RSS (which carries the runtime itself).
let peakHeapMb = 0;
const sample = setInterval(() => {
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  peakHeapMb = Math.max(peakHeapMb, (heapUsed + arrayBuffers) / 1048576);
}, 20);

const { terms, failedFetches } = await detectAvailableTerms();
const failures: { step: string; error: string }[] = [];

let buildings: unknown = null;
try {
  buildings = await withScrapeDb(url, (db) =>
    importBuildings(db, buildingsToImport(loadBuildingSources())),
  );
} catch (error) {
  failures.push({ step: "import-buildings", error: describe(error) });
}

const termResults: TermReconcileResult[] = [];
for (const { academicPeriod } of terms) {
  if (only && !only.includes(academicPeriod)) continue;
  const t0 = Date.now();
  try {
    const result = await reconcileOneTerm(env, academicPeriod, skipInvariants);
    termResults.push(result);
    // With `node --expose-gc`, what a finished term still holds on to.
    (globalThis as { gc?: () => void }).gc?.();
    const retained = Math.round(process.memoryUsage().heapUsed / 1048576);
    console.error(
      `${academicPeriod}: ${result.offeringCount} sections, ${result.meetingCount} meetings in ${((Date.now() - t0) / 1000).toFixed(1)} s, heap after ${retained} MB`,
    );
  } catch (error) {
    failures.push({
      step: `reconcile-term-${academicPeriod}`,
      error: describe(error),
    });
  }
}

clearInterval(sample);
const invariantFailures = termResults.flatMap((r) =>
  r.invariants
    .filter((i) => !i.ok && !i.skipped && i.severity === "error")
    .map((i) => `${r.academicPeriod}:${i.name}`),
);
const ok =
  failedFetches.length === 0 &&
  failures.length === 0 &&
  invariantFailures.length === 0;
const report = {
  ok,
  startedAt: startedAt.toISOString(),
  seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
  peakHeapMb: Math.round(peakHeapMb),
  // Linux reports kilobytes. Includes the Node runtime itself.
  peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  termResults,
  failedFetches,
  failures,
  buildings,
};

if (record) {
  const db = createScrapeDb(url, 1);
  try {
    await recordRun(db, {
      job: SCRAPE_HEARTBEAT_JOB,
      startedAt,
      ok,
      report: { ...report, local: true },
    });
    if (ok && !only) await recordHeartbeat(db, SCRAPE_HEARTBEAT_JOB);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
