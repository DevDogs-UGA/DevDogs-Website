/**
 * The Supabase jobs' places in the command tree: declaration only, nothing
 * here runs. The handlers live in `commands.ts` beside it.
 *
 * Each sequences several tool calls (or asks a question between them) and
 * prints the commands it ran. They were once subcommands of `preset`; now each
 * is a top-level command under its own name, so the menu's first screen can
 * offer them directly. `preset` is refused with the new name (`cli.ts`'s
 * `RETIRED`).
 */
import { YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const restartStackCommand: CommandNode = {
  name: "restart-stack",
  title: "Restart local Supabase",
  dryRun: "handled",
  summary: "Restart the local Supabase stack.",
  hint: "supabase stop, then start; picks up config.toml",
  scope: "machine",
  // Restarting a stack that is not running is the one question a menu
  // should never ask; `supabase start` is the command for that.
  when: "instance-running",
};

export const newMigrationCommand: CommandNode = {
  name: "new-migration",
  title: "Create a new migration",
  dryRun: "handled",
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
};

export const applyMigrationsCommand: CommandNode = {
  name: "apply-migrations",
  title: "Apply migrations to the database",
  dryRun: "handled",
  summary: "Apply new migrations to the session's database.",
  hint: "supabase db push, then offers types:db",
  scope: "endpoint",
  options: [YES],
};

export const pushConfigCommand: CommandNode = {
  name: "push-config",
  title: "Push Supabase settings",
  dryRun: "handled",
  summary: "Push config.toml to the session's hosted project.",
  hint: "shows the diff first; the local stack reads it on restart",
  scope: "endpoint",
  options: [YES],
};
