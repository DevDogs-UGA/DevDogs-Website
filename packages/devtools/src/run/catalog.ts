/**
 * `run`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

/**
 * The three flags every `run` task takes.
 *
 * None carries a `prompt`, and that is the point rather than an omission.
 * `run` opens a multiselect of the apps defining the task, so a wizard that
 * asked "every package?", "which filter?" and "which tier?" up front would
 * ask the same question three times and let the answers disagree. `--tier`
 * is promptless for a different reason than `--filter`/`--all`, though: it is
 * not a question `run` asks itself elsewhere (unlike `cron run`'s own
 * `--tier`, which opens a live picker) — it is a scripting input with no
 * wizard equivalent, the same category `--json` sits in. `--help` still
 * documents all three, which is where someone scripting this will look.
 *
 * Same reasoning as `VAULT_TARGET` above: the command owns the question, so the
 * tree declares the flag and stays quiet.
 */
const RUN_OPTIONS: readonly CommandOption[] = [
  {
    flag: "--filter",
    value: "<pkg>",
    summary: "Limit to a package. pnpm's own flag; skips the question.",
  },
  {
    flag: "--all",
    summary: "Every package, unfiltered, with nothing asked.",
  },
  {
    flag: "--tier",
    value: "<t>",
    summary: "Load a tier's env into the run. CLI-only; never prompted.",
  },
];

export const runCommand: CommandNode = {
  name: "run",
  summary: "Run a pnpm workspace task, asking which apps first.",
  hint: "build, dev, lint…",
  // The six with a root alias, which are the six a contributor types.
  // NOT an exhaustive list of every package script: `run` forwards
  // whatever name it is given, so `test:coverage` works without being
  // listed here, and this CLI's own unrelated `deploy` command group
  // stays out of a menu where a same-named package script would sit
  // one line away from it.
  subcommands: [
    {
      name: "build",
      summary: "Compile every package an app needs.",
      options: RUN_OPTIONS,
    },
    {
      name: "dev",
      summary: "Start the development servers.",
      options: RUN_OPTIONS,
    },
    {
      name: "typecheck",
      summary: "Run tsc across the workspace.",
      options: RUN_OPTIONS,
    },
    {
      name: "lint",
      summary: "Run ESLint across the workspace.",
      options: RUN_OPTIONS,
    },
    {
      name: "lint:fix",
      summary: "Run ESLint and write what it can fix.",
      options: RUN_OPTIONS,
    },
    {
      name: "test",
      summary: "Run the unit tests.",
      options: RUN_OPTIONS,
    },
  ],
};
