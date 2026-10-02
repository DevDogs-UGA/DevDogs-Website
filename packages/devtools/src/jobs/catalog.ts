/**
 * `jobs`' place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * One command for both kinds of background job an app runs on Cloudflare:
 * quick syncs (cron triggers that call a route) and long-running jobs
 * (Workflows). They used to be the separate `cron` and `workflows` commands,
 * which asked a contributor to know how a job is built before they could run
 * it. Both names stay, as aliases that narrow `jobs` to their own kind, so
 * every existing `cron run` and `workflows serve` keeps working.
 */
import {
  JSON_FLAG,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

/**
 * Narrows `run` and `list` to one kind. What the `cron` and `workflows`
 * aliases stand for, and promptless: the picker's headings already split the
 * two kinds, so a wizard question in front of it would ask the same thing
 * twice.
 */
const KIND: CommandOption = {
  flag: "--kind",
  value: "<k>",
  summary: "sync or long-running. Both when absent.",
};

const APP: CommandOption = {
  flag: "--app",
  value: "<slug>",
  summary: "Limit to one app.",
};

const PORT: CommandOption = {
  flag: "--port",
  value: "<n>",
  summary: "Local Workflow runtime port. Defaults to 8787.",
};

export const jobsCommand: CommandNode = {
  name: "jobs",
  title: "Background jobs",
  summary: "Run, list or serve the apps' cron syncs and Workflows.",
  hint: "run one now, list them, or keep a Workflow runtime open",
  aliases: [
    { name: "cron", implies: ["--kind", "sync"] },
    { name: "workflows", implies: ["--kind", "long-running"] },
  ],
  subcommands: [
    {
      name: "run",
      title: "Run a job now",
      summary: "Choose a job and run it now on a tier.",
      hint: "pick from the apps' Worker configuration",
      options: [
        {
          ...APP,
          summary: "Limit the discovered jobs to one app.",
        },
        {
          flag: "--tier",
          value: "<t>",
          summary: "development, staging or production. Asked when absent.",
        },
        {
          flag: "--cron",
          value: "<expr>",
          summary: "Run this quick sync without opening the picker.",
        },
        {
          flag: "--workflow",
          value: "<name>",
          summary: "Run this long-running job without opening the picker.",
        },
        {
          flag: "--params",
          value: "<json>",
          summary: "JSON parameters passed to a Workflow instance.",
        },
        PORT,
        KIND,
        YES,
      ],
    },
    {
      name: "list",
      title: "List every job and when it runs",
      dryRun: "read-only",
      summary: "Every job, its schedule, and any schedule that never fires.",
      hint: "the audit view",
      options: [
        APP,
        {
          flag: "--tier",
          value: "<t>",
          summary: "Whose wrangler schedules to read. All tiers if omitted.",
          prompt: {
            kind: "select",
            message: "Which tier's wrangler schedules?",
            choices: [
              { value: "development", hint: "the default" },
              { value: "staging" },
              { value: "production" },
            ],
          },
        },
        KIND,
        JSON_FLAG,
      ],
    },
    {
      name: "serve",
      title: "Keep a local Workflow runtime open",
      // Under any name: `cron serve` still serves Workflows, since a sync
      // needs no runtime of its own.
      summary: "Run an app's Workflows locally until Ctrl+C, even via cron.",
      hint: "secure alternative to bare wrangler dev",
      options: [
        {
          ...APP,
          summary: "Serve the development Workflows for this app.",
        },
        PORT,
      ],
    },
  ],
};
