/**
 * `import attendance`'s place in the command tree: declaration only, nothing
 * runs. The handler lives in `commands.ts` beside it.
 *
 * `envFree` like `involvement`: production's keys come from the checkout's
 * `.env.production` or Secrets Manager, so it runs under `pnpm dlx`.
 */
import { DRY_RUN, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const attendanceImport: CommandNode = {
  name: "attendance",
  envFree: true,
  dryRun: "handled",
  summary:
    "Import a sign-in sheet (form responses or a spreadsheet, as CSV) for one meeting.",
  hint: "previews, then asks",
  options: [
    {
      flag: "--meeting",
      value: "<meeting>",
      summary: "The meeting: its day (2026-09-09), slug or id.",
    },
    {
      flag: "--file",
      value: "<csv>",
      summary: "The sign-in sheet, saved as CSV.",
    },
    {
      flag: "--email-column",
      value: "<header>",
      summary: "The column of UGA addresses, when there are several.",
    },
    {
      flag: "--name-column",
      value: "<header>",
      summary: "The column of names, used for new accounts.",
    },
    {
      flag: "--replace",
      summary:
        "Make this sheet the meeting's whole imported set: remove earlier imported rows it lacks.",
    },
    DRY_RUN,
    YES,
  ],
};
