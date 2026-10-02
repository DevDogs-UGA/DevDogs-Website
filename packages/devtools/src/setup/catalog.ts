/**
 * `setup`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const setupCommand: CommandNode = {
  name: "setup",
  title: "Set up this checkout",
  summary: "Check prerequisites and seed .env.",
  hint: "run this first",
};
