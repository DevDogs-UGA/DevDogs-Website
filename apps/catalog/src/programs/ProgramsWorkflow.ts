/**
 * The daily UGA Bulletin program sync, as a Cloudflare Workflow. It mirrors the
 * Bulletin's credential-bearing programs into `platform."academicPrograms"` for
 * the account Academics combobox, and used to run as the last route of the
 * platform's nightly-repair cron. It moved here with the registrar scrape
 * (TASK-469): one Worker owns what is scraped from UGA's sites.
 *
 * Two steps so the slow part (about 42 pages, 350 ms apart, to stay under three
 * requests a second) and the database write retry independently. The write
 * happens only after every page validated, as one transaction.
 *
 * Reports through its own heartbeat row, `catalog-academic-programs`.
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import * as Sentry from "@sentry/cloudflare";
import { withScrapeDb } from "~/db/client";
import { resolveDatabaseUrl, type DatabaseEnv } from "~/db/url";
import { recordHeartbeat, recordRun, PROGRAMS_HEARTBEAT_JOB } from "~/scrape/heartbeat";
import { catalogSentryOptions, type SentryEnv } from "~/sentry";
import { scrapeBulletinPrograms, type BulletinScrape } from "./bulletin";
import { writeAcademicPrograms, type AcademicProgramSyncReport } from "./sync";

/** A scheduled run passes nothing. */
export type ProgramsWorkflowParams = Record<string, never>;

type Env = DatabaseEnv & SentryEnv;

class ProgramsWorkflowBase extends WorkflowEntrypoint<Env, ProgramsWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<ProgramsWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<AcademicProgramSyncReport> {
    const startedAt = new Date(event.timestamp);
    try {
      // The scrape's output is plain data (about 600 programs), so the
      // Workflows engine can persist it between the steps.
      const scrape: BulletinScrape = await step.do(
        "scrape-bulletin",
        {
          retries: { limit: 3, delay: "1 minute", backoff: "exponential" },
          timeout: "10 minutes",
        },
        async (ctx) => {
          console.log(`[catalog-programs] scrape-bulletin attempt ${ctx.attempt}`);
          return scrapeBulletinPrograms();
        },
      );

      const report = await step.do(
        "write-programs",
        {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "5 minutes",
        },
        async () =>
          withScrapeDb(resolveDatabaseUrl(this.env), (db) =>
            writeAcademicPrograms(db, scrape),
          ),
      );
      console.info("academic_program_sync_succeeded", report);

      await step.do("record-run", async () =>
        withScrapeDb(resolveDatabaseUrl(this.env), async (db) => {
          await recordRun(db, {
            job: PROGRAMS_HEARTBEAT_JOB,
            startedAt,
            ok: true,
            report,
          });
          await recordHeartbeat(db, PROGRAMS_HEARTBEAT_JOB);
        }),
      );
      return report;
    } catch (err) {
      // Best effort: the heartbeat going overdue is the alarm, this is the why.
      try {
        await withScrapeDb(resolveDatabaseUrl(this.env), (db) =>
          recordRun(db, {
            job: PROGRAMS_HEARTBEAT_JOB,
            startedAt,
            ok: false,
            report: { error: err instanceof Error ? err.message : String(err) },
          }),
        );
      } catch {
        // The original error is the one to report.
      }
      Sentry.captureException(err);
      await Sentry.flush(2000);
      throw err;
    }
  }
}

export const ProgramsWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => catalogSentryOptions(env) ?? {},
  ProgramsWorkflowBase,
);
