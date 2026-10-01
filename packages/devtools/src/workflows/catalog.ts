/**
 * `workflows`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { JSON_FLAG, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const workflowsCommand: CommandNode = {
  name: "workflows",
  summary: "Cloudflare Workflows: list configured bindings or trigger one.",
  hint: "pick a workflow from wrangler.jsonc",
  subcommands: [
    {
      name: "list",
      dryRun: "read-only",
      summary: "List every Workflow binding declared by each Wrangler tier.",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "Limit to one app.",
        },
        {
          flag: "--tier",
          value: "<t>",
          summary: "Limit to development, staging or production.",
        },
        JSON_FLAG,
      ],
    },
    {
      name: "run",
      summary: "Choose and trigger a Workflow through Wrangler.",
      hint: "local session or a deployed tier",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "Limit the discovered Workflows to one app.",
        },
        {
          flag: "--tier",
          value: "<t>",
          summary: "development, staging or production. Asked when absent.",
        },
        {
          flag: "--workflow",
          value: "<name>",
          summary: "Trigger this configured name without opening the picker.",
        },
        {
          flag: "--params",
          value: "<json>",
          summary: "JSON parameters passed to the Workflow instance.",
        },
        {
          flag: "--port",
          value: "<n>",
          summary: "Local Wrangler session port. Defaults to 8787.",
        },
        YES,
      ],
    },
    {
      name: "serve",
      summary: "Start an app-scoped local Wrangler runtime until Ctrl+C.",
      hint: "secure alternative to bare wrangler dev",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "Serve the development Workflow for this app.",
        },
        {
          flag: "--port",
          value: "<n>",
          summary: "Local Wrangler session port. Defaults to 8787.",
        },
      ],
    },
  ],
};
