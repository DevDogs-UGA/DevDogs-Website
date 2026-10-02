/**
 * `export`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * `envFree` like `involvement`: production's `DB_URL` comes from the
 * checkout's `.env.production` or Secrets Manager, and the audit identity from
 * `gh`, so it runs under `pnpm dlx`.
 */
import {
  DRY_RUN,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";
import { EXPORTS, type ExportKind } from "./queries.js";

const FROM: CommandOption = {
  flag: "--from",
  value: "<day>",
  summary: "From this Eastern day (or ISO timestamp), inclusive.",
};

const TO: CommandOption = {
  flag: "--to",
  value: "<day>",
  summary: "Through this Eastern day (or before this ISO timestamp).",
};

const OUT: CommandOption = {
  flag: "--out",
  value: "<path|->",
  summary: "Where to write. Defaults to ./<kind>….csv; - for stdout.",
};

function exportOf(kind: ExportKind, extra: CommandOption[] = []): CommandNode {
  return {
    name: kind,
    envFree: true,
    dryRun: "handled",
    summary: EXPORTS[kind].summary,
    options: [FROM, TO, ...extra, OUT, DRY_RUN, YES],
  };
}

export const exportCommand: CommandNode = {
  name: "export",
  summary: "Member data as CSV: stars, attendance, reflections. Audited.",
  hint: "production database; your gh login is recorded",
  subcommands: [
    exportOf("stars"),
    exportOf("attendance", [
      {
        flag: "--meeting",
        value: "<meeting>",
        summary: "One meeting: its day (2026-09-09), slug, config id or id.",
      },
    ]),
    exportOf("reflections"),
  ],
};
