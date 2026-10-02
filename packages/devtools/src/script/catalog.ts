/**
 * `script`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const scriptCommand: CommandNode = {
  name: "script",
  title: "Run a package script",
  dryRun: "handled",
  summary: "Pick a package, then one of its scripts, and run it.",
  hint: "pnpm -F <package> run <script>",
};
