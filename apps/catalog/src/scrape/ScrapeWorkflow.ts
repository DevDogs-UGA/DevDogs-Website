/**
 * The daily registrar scrape, as a Cloudflare Workflow. It moved here from
 * schedule-builder, which only ever read what it wrote; the catalog Worker owns
 * the registrar data now and DogDays, DogPack and the rest read it through the
 * catalog API. The native schedule is on the Workflow binding in wrangler.jsonc.
 *
 * One `step.do` per term, so a single term's failure (a vanished CSV, a bad
 * calendar lookup, a violated invariant) cannot burn the budget of, or abort,
 * the others. Each step is retried and checkpointed by the Workflows engine, so
 * a crash resumes from the last completed step instead of restarting the run.
 *
 * A step runs with no per-request context, so each builds its own database
 * client from the Hyperdrive binding (or local `DB_URL`) INSIDE the step and
 * closes it there: a step may resume in a new isolate, and a live Postgres
 * connection cannot survive that gap.
 *
 * Memory. A term is streamed (see ../scrape/csv.ts), never parsed whole; the
 * daily "Worker exceeded memory limit" of the old scrape is why. And no step
 * output carries rows: the Workflows engine persists whatever a step returns.
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import * as Sentry from "@sentry/cloudflare";
import { importBuildings, type BuildingImportResult } from "~/buildings/importBuildings";
import { withScrapeDb } from "~/db/client";
import { resolveDatabaseUrl, type DatabaseEnv } from "~/db/url";
import { catalogSentryOptions, type SentryEnv } from "~/sentry";
import { recordHeartbeat, recordRun, SCRAPE_HEARTBEAT_JOB } from "./heartbeat";
import { detectAvailableTerms } from "./parsers";
import type { FailedFetch } from "./parsers/AvailableTerms";
import type { TermReconcileResult } from "./parsers/reconcileTerm";
import { FatalTermError, reconcileOneTerm } from "./runTerm";

/**
 * What a manual run can ask for. A scheduled run passes nothing.
 *
 * `terms` limits the run to those academic periods (`202702`), which is how a
 * staging check scrapes one term; a limited run never writes the heartbeat,
 * since it is not the whole scrape. `skipInvariants` waives the named
 * invariants for this run, for the day a human has looked at a 20% swing in
 * sections and says it is real:
 *
 *   wrangler workflows trigger production-catalog-scrape '{"skipInvariants":["sectionCountStable"]}'
 */
export type ScrapeWorkflowParams = {
  terms?: number[];
  skipInvariants?: string[];
};

type Env = DatabaseEnv & SentryEnv;

/**
 * `run()`'s return value, and every intermediate `step.do` return value, is
 * persisted by the Workflows engine and replayed on resume: plain data only.
 */
export type ScrapeWorkflowResult = {
  termResults: TermReconcileResult[];
  failedFetches: FailedFetch[];
  failures: { step: string; academicPeriod?: number; error: string }[];
  buildings: BuildingImportResult | null;
};

/** Retries for the steps that read the registrar or write a term. Backoff is longer than the database's idle-in-transaction timeout (30 s), so a retry after a killed attempt finds its locks released. */
const TERM_STEP = {
  retries: { limit: 3, delay: "45 seconds", backoff: "exponential" },
  timeout: "15 minutes",
} as const;

const DB_STEP = {
  retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ScrapeWorkflowBase extends WorkflowEntrypoint<Env, ScrapeWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<ScrapeWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<ScrapeWorkflowResult> {
    const params = event.payload ?? {};
    const only = params.terms && params.terms.length > 0 ? new Set(params.terms) : null;
    const skipInvariants = params.skipInvariants ?? [];
    const startedAt = new Date(event.timestamp);

    try {
      // Only the academic period + description survive to the next step: a
      // step's return value is persisted, and each term's own step streams its
      // file again.
      const detection = await step.do("detect-available-terms", async (ctx) => {
        console.log(`[catalog-scrape] detect-available-terms attempt ${ctx.attempt}`);
        Sentry.addBreadcrumb({
          category: "workflow-step",
          message: `detect-available-terms attempt ${ctx.attempt}`,
          level: "info",
        });
        const { terms, failedFetches } = await detectAvailableTerms();
        if (failedFetches.length > 0) {
          console.error("[catalog-scrape] CSV fetch failures:", failedFetches);
        }
        return { terms, failedFetches };
      });

      if (detection.terms.length === 0) {
        throw new NonRetryableError(
          `No registrar terms were detected: ${JSON.stringify(detection.failedFetches)}`,
        );
      }

      const failures: ScrapeWorkflowResult["failures"] = [];

      // Before the terms, so a building the registrar uses for the first time
      // already has its point when the term's coverage is counted. The dataset
      // is validated here as well as in CI; a bad edit that got past CI fails
      // this step and is reported, without holding the registrar data back.
      let buildings: BuildingImportResult | null = null;
      try {
        buildings = await step.do("import-buildings", DB_STEP, async () =>
          withScrapeDb(resolveDatabaseUrl(this.env), (db) => importBuildings(db)),
        );
      } catch (err) {
        failures.push({ step: "import-buildings", error: message(err) });
      }

      const termResults: TermReconcileResult[] = [];
      for (const { academicPeriod } of detection.terms) {
        if (only && !only.has(academicPeriod)) continue;
        // One term's failure must not abort the loop: caught here rather than
        // left to reject `run()` and take every other term down with it.
        try {
          const result = await step.do(
            `reconcile-term-${academicPeriod}`,
            TERM_STEP,
            async (ctx) => {
              console.log(
                `[catalog-scrape] reconcile-term-${academicPeriod} attempt ${ctx.attempt}`,
              );
              Sentry.addBreadcrumb({
                category: "workflow-step",
                message: `reconcile-term-${academicPeriod} attempt ${ctx.attempt}`,
                level: "info",
              });
              try {
                return await reconcileOneTerm(
                  this.env,
                  academicPeriod,
                  skipInvariants,
                );
              } catch (error) {
                // Retrying would read the same feed and fail the same way.
                if (error instanceof FatalTermError) {
                  throw new NonRetryableError(error.message);
                }
                throw error;
              }
            },
          );
          termResults.push(result);
        } catch (err) {
          failures.push({
            step: `reconcile-term-${academicPeriod}`,
            academicPeriod,
            error: message(err),
          });
        }
      }

      const ok = detection.failedFetches.length === 0 && failures.length === 0;

      // The run's report, kept whether or not it was clean: the heartbeat says
      // "no success since", this says why. Its own step so a replay does not
      // write it twice.
      await step.do("record-run", DB_STEP, async () =>
        withScrapeDb(resolveDatabaseUrl(this.env), (db) =>
          recordRun(db, {
            job: SCRAPE_HEARTBEAT_JOB,
            startedAt,
            ok,
            report: {
              params,
              termResults,
              failures,
              failedFetches: detection.failedFetches,
              buildings,
            },
          }),
        ),
      );

      // Partial writes are useful, but a partially refreshed catalog is not a
      // successful scrape. Mark the instance errored after every viable term
      // had its chance, so the dashboard and CLI cannot report a false green,
      // and write no heartbeat, so the platform's daily-jobs check goes overdue.
      if (!ok) {
        throw new NonRetryableError(
          `Registrar scrape completed partially: ${JSON.stringify({
            failedFetches: detection.failedFetches,
            failures,
            completedPeriods: termResults.map((r) => r.academicPeriod),
          })}`,
        );
      }

      // Not for a run limited to some terms: that is not the whole scrape.
      // Its own step so a replay after this point does not write it twice, and
      // so a failed write is retried like any other database call.
      if (!only) {
        await step.do("record-heartbeat", DB_STEP, async () =>
          withScrapeDb(resolveDatabaseUrl(this.env), (db) =>
            recordHeartbeat(db, SCRAPE_HEARTBEAT_JOB),
          ),
        );
      }

      return { termResults, failedFetches: detection.failedFetches, failures, buildings };
    } catch (err) {
      // Terminal only: the failure paths above that happen OUTSIDE a
      // `step.do` call (zero terms detected; the aggregate "completed
      // partially" throw), plus any truly unexpected bug in this method's own
      // control flow. A per-term step that exhausted its retries was already
      // captured by the wrapper's per-step instrumentation before landing in
      // the per-term `catch` above; this is a separate, aggregate signal for
      // the run as a whole.
      Sentry.captureException(err);
      // `flush` is normally handled per-step by the wrapper, but this throw
      // happens outside any `step.do` call.
      await Sentry.flush(2000);
      throw err;
    }
  }
}

/**
 * The instrumented export. wrangler.jsonc's `workflows[].class_name` binding and
 * `src/worker.ts`'s re-export both name it. `instrumentWorkflowWithSentry`
 * substitutes `step` for a Sentry-instrumented proxy before `run()`, so every
 * `step.do` gets a span and, on its last retry, an automatic `captureException`.
 */
export const ScrapeWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => catalogSentryOptions(env) ?? {},
  ScrapeWorkflowBase,
);
