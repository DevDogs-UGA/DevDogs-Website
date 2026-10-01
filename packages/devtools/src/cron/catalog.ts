/**
 * `cron`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { JSON_FLAG, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const cronCommand: CommandNode = {
  name: "cron",
  summary: "Cloudflare cron triggers: list schedules or fire one now.",
  hint: "list schedules, run a job",
  subcommands: [
    {
      name: "list",
      summary: "Every registered cron: schedule, English description, routes.",
      hint: "the audit view",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "Limit to one app. All apps if omitted.",
        },
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
        JSON_FLAG,
      ],
    },
    {
      name: "run",
      summary: "Choose and fire a configured cron schedule now.",
      hint: "pick a job from the Worker configuration",
      options: [
        {
          flag: "--app",
          value: "<slug>",
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
          summary: "Fire this schedule without opening the picker.",
        },
        YES,
      ],
    },
  ],
};
