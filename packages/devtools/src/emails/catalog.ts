/**
 * `emails`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const emailsCommand: CommandNode = {
  name: "emails",
  summary: "Render populated transactional email previews.",
  hint: "HTML or plain text, one template or all",
  // Like `images`, this command owns its dependent questions: formats
  // and output only make sense after the templates have been selected.
  options: [
    {
      flag: "--format",
      value: "<html,text>",
      summary: "Outputs to write. Defaults to html.",
    },
    {
      flag: "--out",
      value: "<dir>",
      summary: "Output directory. Defaults to ./email-previews.",
    },
    {
      flag: "--dry-run",
      summary: "List subjects and destination files without writing.",
    },
  ],
};
