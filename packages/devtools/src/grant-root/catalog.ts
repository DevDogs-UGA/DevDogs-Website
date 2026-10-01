/**
 * `grant-root`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const grantRootCommand: CommandNode = {
  name: "grant-root",
  summary: "Give an account every permission on your own database.",
  // Also on the session system now — every tier, not just local. See
  // `check`'s note above; production additionally gets `YES`'s stern
  // confirmation, the same treatment `db reset` gives it.
  options: [
    {
      flag: "--user",
      value: "<email>",
      summary: "Account to grant Root to. Asked for when absent.",
    },
    YES,
  ],
};
