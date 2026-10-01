/**
 * The passthroughs' place in the command tree: declaration only, nothing here
 * runs. The handlers live in `commands.ts` beside it.
 *
 * Each is the real tool plus the session's env and tier; everything after the
 * tool name is forwarded untouched. They are `cli-only`: the wizard builds
 * commands from the presets instead, and `--help` here is the tool's own.
 */
import type { CommandNode } from "@devdogsuga/cli-core/catalog";

export const supabaseCommand: CommandNode = {
  name: "supabase",
  summary: "Run the Supabase CLI against the session's tier.",
  hint: "fills in --db-url / --project-ref; the rest is yours",
  surface: "cli-only",
};

export const wranglerCommand: CommandNode = {
  name: "wrangler",
  summary: "Run Wrangler with the session's env.",
  hint: "everything after the name goes to wrangler",
  surface: "cli-only",
};

export const drizzleKitCommand: CommandNode = {
  name: "drizzle-kit",
  summary: "Run drizzle-kit with the session's env.",
  hint: "run it from the app that owns the config",
  surface: "cli-only",
};

export const psqlCommand: CommandNode = {
  name: "psql",
  summary: "Run psql against the session's database.",
  hint: "connects with the tier's DB_URL unless you say otherwise",
  surface: "cli-only",
};
