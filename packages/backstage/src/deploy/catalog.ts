/**
 * `deploy`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  DRY_RUN,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const DEPLOY_TIER: CommandOption = {
  flag: "--tier",
  value: "<t>",
  summary: "staging or production. Or set DEPLOY_ENV.",
  prompt: {
    kind: "select",
    message: "Which environment?",
    choices: [{ value: "staging" }, { value: "production", hint: "⚠️  live" }],
  },
};

const SMOKE_APP: CommandOption = {
  flag: "--app",
  value: "<app>",
  summary: "Which app to check. Defaults to platform.",
};

function app(name: string): CommandNode {
  return {
    name,
    summary: `Deploy the ${name} app.`,
    options: [DEPLOY_TIER, DRY_RUN, YES],
  };
}

export const deployCommand: CommandNode = {
  name: "deploy",
  dryRun: "handled",
  summary: "Deploy an app, or run one step of a deploy.",
  hint: "needs CLOUDFLARE_API_TOKEN and the tier's env",
  subcommands: [
    // ── Apps ────────────────────────────────────────────────────────────
    app("platform"),
    app("schedule-builder"),
    app("sandbox"),
    // ── Steps ───────────────────────────────────────────────────────────
    {
      name: "write-env",
      summary: "Compose .env.<DEPLOY_ENV> from the GitHub environment.",
      hint: "run it with --no-env: it creates the file the tier needs",
      options: [
        {
          flag: "--source",
          value: "<manifest>",
          summary: "Compose one manifest's slice instead of all.",
        },
        DRY_RUN,
      ],
    },
    {
      name: "preflight",
      dryRun: "read-only",
      summary: "Classify the project: paused (skip) vs broken (fail).",
    },
    {
      name: "plan",
      dryRun: "read-only",
      summary: "Dry-run the migrations into the job summary.",
      options: [
        {
          flag: "--label",
          value: "<title>",
          summary: "Heading for the summary section.",
        },
      ],
    },
    {
      name: "migrate",
      summary: "Apply the migrations to DB_URL.",
      options: [DRY_RUN],
    },
    {
      name: "smoke",
      dryRun: "read-only",
      summary: "Check a deployed app: public routes, auth redirect, Sentry.",
      hint: "per-app data comes from workers.json",
      options: [DEPLOY_TIER, SMOKE_APP],
    },
    {
      name: "reconcile",
      dryRun: "read-only",
      summary: "Run the platform's config reconcile after a deploy.",
      hint: "needs CRON_SECRET",
      options: [DEPLOY_TIER, SMOKE_APP],
    },
    {
      name: "prune-monitors",
      summary: "Delete the Sentry Crons monitors an app no longer declares.",
      hint: "needs SENTRY_MONITORS_TOKEN; production only",
      options: [DEPLOY_TIER, SMOKE_APP, DRY_RUN],
    },
  ],
};
