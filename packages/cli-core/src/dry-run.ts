/**
 * `--dry-run`: print what would run, run nothing, write nothing, exit 0.
 *
 * One switch for the whole CLI, settled by the launcher before any command
 * runs. Two layers honour it, so no command has to remember to:
 *
 *   * `runInGroup` (every tool the CLI spawns) prints `Would run: <command>`
 *     and does not spawn. A passthrough, a Supabase job or the `run` alias
 *     therefore shows the exact tool calls it would make.
 *   * the dispatcher stops any command that has not said how it treats the
 *     flag (see `CommandNode.dryRun`) and prints the devtools command it
 *     stopped, so a command that spawns or writes can never run by accident.
 *
 * ## Where the flag may sit
 *
 * The passthroughs and `run` hand everything after the tool name to the tool
 * untouched, and a tool may have a `--dry-run` of its own (`supabase db push
 * --dry-run` is the real one). So for those, only a `--dry-run` BEFORE the
 * tool name is ours: `devtools --dry-run supabase db push`. Anywhere else the
 * flag is the command's own, and also ours.
 */
import type { Catalog } from "./catalog.js";
import { cliName } from "./cli-name.js";

export const DRY_RUN_FLAG = "--dry-run";

/** Commands that forward everything after their name to another tool. */
const FORWARDING = new Set([
  "supabase",
  "wrangler",
  "drizzle-kit",
  "psql",
  "bw",
  "run",
]);

let active = false;

export function setDryRun(on: boolean): void {
  active = on;
}

export function isDryRun(): boolean {
  return active;
}

/**
 * Decides whether `argv` asks for a dry run and returns the argv to dispatch.
 *
 * For a forwarding command a leading `--dry-run` is consumed (the tool never
 * sees it) and a later one is the tool's. For any other command the argv is
 * returned as it came, because several commands read `--dry-run` themselves.
 */
export function resolveDryRun(argv: readonly string[]): {
  dryRun: boolean;
  rest: string[];
} {
  const firstPositional = argv.findIndex((arg) => !arg.startsWith("-"));
  const lead = firstPositional === -1 ? argv.length : firstPositional;
  const command = argv[firstPositional];

  if (command !== undefined && FORWARDING.has(command)) {
    const rest = argv.filter((arg, i) => i >= lead || arg !== DRY_RUN_FLAG);
    return { dryRun: rest.length !== argv.length, rest };
  }
  return { dryRun: argv.includes(DRY_RUN_FLAG), rest: [...argv] };
}

/**
 * How a command treats `--dry-run`, from the nearest node on its path that
 * says. `undefined` means it did not say, and the dispatcher stops it.
 */
export function dryRunKind(
  catalog: Catalog,
  path: readonly string[],
): "read-only" | "handled" | undefined {
  for (let end = path.length; end > 0; end -= 1) {
    const kind = catalog.findCommand(path.slice(0, end))?.dryRun;
    if (kind !== undefined) return kind;
  }
  return undefined;
}

/** The command line a stopped command would have run. */
export function wouldRunLine(argv: readonly string[]): string {
  return `Would run: ${cliName()} ${argv.join(" ")}`;
}
