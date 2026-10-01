/**
 * `db`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * Deprecated, and `cli-only` so the wizard never offers it: the `db`
 * namespace is gone, and these three are thin aliases for the commands
 * DevDogsUGA's `main` still calls (its CI, and the apps' drizzle config
 * comments). The cutover moves those callers and deletes this group.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const dbCommand: CommandNode = {
  name: "db",
  summary: "Deprecated aliases for the old database commands.",
  hint: "deprecated: use supabase, types:db, types:drizzle",
  surface: "cli-only",
  deprecated:
    "The `db` namespace is gone; each subcommand below names its replacement.",
  subcommands: [
    {
      name: "start",
      summary: "Start Supabase on this machine.",
      surface: "cli-only",
      deprecated: "Use `devtools supabase start`.",
    },
    {
      name: "types",
      summary: "Regenerate the committed database types.",
      surface: "cli-only",
      deprecated: "Use `pnpm -F @devdogsuga/supabase types:db`.",
    },
    {
      name: "introspect",
      summary: "Pull an app's Drizzle schema from the session's database.",
      surface: "cli-only",
      deprecated: "Use the app's `types:drizzle` script.",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App to introspect.",
        },
      ],
    },
  ],
};
