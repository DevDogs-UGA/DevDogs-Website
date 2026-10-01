/**
 * `planner`'s place in the command tree: declaration only, nothing here
 * runs. The handler lives in `commands.ts` beside it. Production-only: the
 * role it manages exists for the deploy pipeline's preflight tier.
 */
import {
  JSON_FLAG,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const DB_URL: CommandOption = {
  flag: "--db-url",
  value: "<url>",
  summary: "Privileged connection. Defaults to .env.production's DB_URL.",
  prompt: {
    kind: "text",
    message: "Connection URL? (blank uses .env.production's DB_URL)",
    optional: true,
  },
};

export const plannerCommand: CommandNode = {
  name: "planner",
  summary: "The migration_planner role the preflight tier may hold.",
  subcommands: [
    {
      name: "status",
      dryRun: "read-only",
      summary: "Does the role exist, hold its two grants, and no more.",
      hint: "reads only — start here",
      options: [DB_URL, JSON_FLAG],
    },
    {
      name: "create",
      summary: "Mint the role, verify it live, write .env.preflight.",
      options: [DB_URL],
    },
    {
      name: "reset-password",
      summary: "Rotate the password. There is no retrieve.",
      options: [DB_URL, YES],
    },
    {
      name: "drop",
      summary: "Remove the role and blank the dead URL.",
      hint: "the recovery path",
      options: [DB_URL, YES],
    },
  ],
};
