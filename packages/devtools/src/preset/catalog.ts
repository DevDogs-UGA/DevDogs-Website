/**
 * The TUI presets' place in the command tree: declaration only, nothing here
 * runs. The handlers live in `commands.ts` beside it.
 *
 * A preset sequences several tool calls (or asks a question between them) and
 * prints the commands it ran. Each is also typed as `devtools preset <name>`.
 */
import { YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const presetCommand: CommandNode = {
  name: "preset",
  summary: "Common Supabase jobs, each a few tool calls in a row.",
  hint: "restart the stack, new migration, apply migrations, push config",
  subcommands: [
    {
      name: "restart-stack",
      summary: "Restart the local Supabase stack.",
      hint: "supabase stop, then start; picks up config.toml",
      scope: "machine",
      // Restarting a stack that is not running is the one question a menu
      // should never ask; `supabase start` is the command for that.
      when: "instance-running",
    },
    {
      name: "new-migration",
      summary: "Create an empty migration for an app's schema.",
      hint: "supabase migration new <schema>_<description>",
      scope: "repo",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "Whose schema. Asked for when absent.",
        },
      ],
    },
    {
      name: "apply-migrations",
      summary: "Apply new migrations to the session's database.",
      hint: "supabase db push, then offers types:db",
      scope: "endpoint",
      options: [YES],
    },
    {
      name: "push-config",
      summary: "Push config.toml to the session's hosted project.",
      hint: "shows the diff first; the local stack reads it on restart",
      scope: "endpoint",
      options: [YES],
    },
  ],
};
