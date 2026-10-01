/**
 * `docs`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

/**
 * `docs index`'s delete acknowledgment — NOT a database selector.
 *
 * The db namespace's old `--target local|remote` flag is retired outright
 * (the SESSION names the database now — see `db/connection.ts`), but `docs
 * index` keeps this spelling for a different job: its prune deletes rows,
 * and running that against a non-local `DB_URL` requires saying so out
 * loud. The database itself still comes from the session's env.
 */
export const DOCS_TARGET: CommandOption = {
  flag: "--target",
  value: "<local|remote>",
  summary: "Acknowledge indexing a non-local DB_URL. Defaults to local-only.",
  prompt: {
    kind: "select",
    message: "May this prune a non-local database?",
    choices: [
      { value: "local", label: "Local only", hint: "the default" },
      { value: "remote", label: "Yes — the session's remote DB_URL" },
    ],
  },
};

export const docsCommand: CommandNode = {
  name: "docs",
  summary: "The documentation search index.",
  subcommands: [
    {
      name: "index",
      summary: "Push the built docs artifact into the search index.",
      hint: "prunes stale rows in the target database",
      scope: "endpoint",
      options: [DOCS_TARGET],
    },
  ],
};
