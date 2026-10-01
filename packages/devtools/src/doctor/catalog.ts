/**
 * `doctor`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const doctorCommand: CommandNode = {
  name: "doctor",
  summary: "Check this machine's environment against what the repo needs.",
  hint: "node, pnpm, Docker, .env, hosted Supabase, OAuth — read-only",
  options: [
    {
      flag: "--app",
      value: "<slug>",
      summary:
        "Scope checks to one app. Defaults to every app you have env for.",
    },
    {
      flag: "--report",
      summary:
        "Print a redacted, paste-able block (versions, OS, results — no secrets).",
    },
  ],
};
