/**
 * The catalog's schedules, as audit metadata for `devtools cron list` and
 * `devtools jobs run`. It imports nothing: devtools loads this file in Node,
 * outside the Worker bundle, and the Worker itself has no `scheduled` handler.
 * Both schedules are native Workflow schedules, declared on the `workflows[]`
 * bindings in wrangler.jsonc, which is the source of truth for whether they
 * fire; this map is how devtools labels them and notices when the two drift.
 *
 * No route-based crons: the catalog never dispatches to one of its own routes.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {};

/** The registrar scrape's schedule. Production only: see wrangler.jsonc. */
export const SCRAPE_SCHEDULE = "5 14 * * *";

/** The Bulletin program sync's schedule, ten minutes after the scrape. */
export const PROGRAMS_SCHEDULE = "35 14 * * *";

export const WORKFLOW_CRONS: Record<
  string,
  { binding: string; label: string }
> = {
  [SCRAPE_SCHEDULE]: {
    binding: "SCRAPE_WORKFLOW",
    label:
      "Daily registrar scrape (one retried, checkpointed ScrapeWorkflow step per term)",
  },
  [PROGRAMS_SCHEDULE]: {
    binding: "PROGRAMS_WORKFLOW",
    label: "Daily UGA Bulletin program sync (ProgramsWorkflow)",
  },
};
