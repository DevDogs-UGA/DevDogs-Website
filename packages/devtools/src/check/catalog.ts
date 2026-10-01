/**
 * `check`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * CI runs these (they replace DevDogsUGA's `packages/repo-checks`), so they are
 * `cli-only` and `envFree`: they read the checkout, never an env file or a
 * database, and need no tier.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const checkCommand: CommandNode = {
  name: "check",
  summary: "Structural checks over the checkout, for CI.",
  hint: "migrations, env, workers, scripts",
  surface: "cli-only",
  subcommands: [
    {
      name: "migrations",
      summary: "New migrations are timestamped after the base branch's.",
      surface: "cli-only",
      envFree: true,
      options: [
        {
          flag: "--base",
          value: "<ref>",
          summary: "Git ref to compare against. Defaults to origin/main.",
        },
      ],
    },
    {
      name: "env",
      summary: "Every env variable is declared, and the registry agrees.",
      surface: "cli-only",
      envFree: true,
    },
    {
      name: "workers",
      summary: "workers.json matches wrangler.jsonc and deploy-app.yaml.",
      surface: "cli-only",
      envFree: true,
    },
    {
      name: "scripts",
      summary: "Package scripts use the shared vocabulary.",
      surface: "cli-only",
      envFree: true,
    },
  ],
};
