/**
 * `github`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { JSON_FLAG, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const githubCommand: CommandNode = {
  name: "github",
  dryRun: "handled",
  summary: "Reconcile the repository's rulesets and settings.",
  hint: "rulesets: main, production, ~ALL, team/**, tags; settings: security, Actions, environments",
  subcommands: [
    {
      name: "rulesets",
      summary: "Diff the fixed rulesets against live GitHub; --apply to write.",
      hint: "dry-run plan by default",
      envFree: true,
      options: [
        {
          flag: "--org",
          value: "<org>",
          summary: "GitHub org. Defaults to DevDogsUGA.",
        },
        {
          flag: "--repo",
          value: "<repo>",
          summary: "Repository name. Defaults to DevDogsUGA.",
        },
        {
          flag: "--app-slug",
          value: "<slug>",
          summary:
            "The GitHub App whose id bypasses team/** creation. Defaults to devdogs-platform.",
        },
        {
          flag: "--apply",
          summary: "Write the plan instead of only printing it.",
        },
        YES,
        JSON_FLAG,
      ],
    },
    {
      name: "settings",
      summary: "Diff security/Actions/environment settings vs live GitHub.",
      hint: "dry-run plan by default",
      envFree: true,
      options: [
        {
          flag: "--org",
          value: "<org>",
          summary: "GitHub org. Defaults to DevDogsUGA.",
        },
        {
          flag: "--repo",
          value: "<repo>",
          summary: "Repository name. Defaults to DevDogsUGA.",
        },
        {
          flag: "--apply",
          summary: "Write fixable drift instead of only printing it.",
        },
        YES,
        JSON_FLAG,
      ],
    },
  ],
};
