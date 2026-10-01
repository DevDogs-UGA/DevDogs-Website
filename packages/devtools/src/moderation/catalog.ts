/**
 * `moderation`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { JSON_FLAG, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const moderationCommand: CommandNode = {
  name: "moderation",
  summary: "An app's moderation integration: the catalog and its wiring.",
  hint: "check",
  subcommands: [
    {
      name: "check",
      summary: "List the catalog, or check one app's moderation integration.",
      hint: "reasons and content types with no --app; per-app wiring with one",
      // No `needs: "instance-running"` any more — this resolves through
      // the session system now (`resolveInstance`, `instance.ts`), the
      // same as `db migrate`/`db reset`, so it works against a hosted
      // development database with no local stack at all. Refuses
      // staging/production itself, with its own message, rather than a
      // menu-only hint.
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App to check. Prints the catalog when absent.",
        },
        JSON_FLAG,
      ],
    },
  ],
};
