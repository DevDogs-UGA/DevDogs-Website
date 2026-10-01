/**
 * `persona`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const personaCommand: CommandNode = {
  name: "persona",
  summary: "A throwaway member or moderator account for development.",
  hint: "member, moderator, or --clean",
  options: [
    {
      flag: "--clean",
      summary:
        "Delete every account this command has created, instead of making one.",
      prompt: {
        kind: "confirm",
        message:
          "Clean up every persona this command created, instead of making one?",
        initial: false,
      },
    },
  ],
};
