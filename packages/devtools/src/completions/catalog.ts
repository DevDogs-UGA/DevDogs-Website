/**
 * `completions`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const completionsCommand: CommandNode = {
  name: "completions",
  summary: "Output a shell completion script for devtools.",
  hint: "pipe to source or write to a file",
  surface: "cli-only",
  options: [
    {
      flag: "--shell",
      value: "<bash|zsh>",
      summary: "Target shell. Asked for when absent.",
      prompt: {
        kind: "select",
        message: "Which shell?",
        choices: [{ value: "bash" }, { value: "zsh" }],
      },
    },
  ],
};
