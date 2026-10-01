/**
 * `bw`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const bwCommand: CommandNode = {
  // The Bitwarden CLI, not a command of this one: everything after `bw`
  // is handed to it untouched. It is here because it is the login that
  // `env pull` depends on, it ships as a devtools dependency, and the
  // root `bw` alias it replaces was the last thing at the workspace root
  // reaching into this package. Declaring no subcommands is deliberate:
  // Bitwarden's commands are its own to document, and mirroring a slice
  // of them here would go stale on their release schedule, not ours.
  name: "bw",
  dryRun: "handled",
  summary: "Run the Bitwarden CLI. `bw login` is the one you want.",
  hint: "passes everything through",
};
