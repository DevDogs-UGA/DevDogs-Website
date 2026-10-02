/**
 * The terminal half shared by the member-data commands: progress lines, the
 * input file, and the one confirmation before production is written.
 */
import { readFile } from "node:fs/promises";
import { confirm, log, text as askText } from "@clack/prompts";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import {
  explain,
  explainError,
  unwrap,
  UsageError,
} from "@devdogsuga/cli-core/ui";
import { ProductionError } from "./access.js";

/** Progress for a person; plain stderr lines when nobody is watching a terminal. */
export function say(
  message: string,
  level: "info" | "success" | "warn" = "info",
) {
  if (isNonInteractive()) process.stderr.write(`${message}\n`);
  else log[level](message);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whether a person can answer a prompt. */
export function canPrompt(): boolean {
  return !isNonInteractive() && process.stdin.isTTY === true;
}

export function expandHome(path: string): string {
  return path.startsWith("~/")
    ? `${process.env.HOME ?? "~"}${path.slice(1)}`
    : path;
}

/** `--file`, else asked for at a terminal; then read. */
export async function readInputFile(
  file: string | undefined,
  options: {
    interactive: boolean;
    message: string;
    placeholder: string;
    read?: (path: string) => Promise<string>;
  },
): Promise<string> {
  let path = file;
  if (!path) {
    if (!options.interactive) {
      throw new UsageError(
        `Pass the file with --file <${options.placeholder}>.`,
      );
    }
    path = unwrap(
      await askText({
        message: options.message,
        placeholder: options.placeholder,
        validate: (v) => (v?.trim() ? undefined : "A path, please."),
      }),
    ).trim();
  }
  const full = expandHome(path);
  try {
    return await (options.read ?? ((p) => readFile(p, "utf8")))(full);
  } catch {
    throw new UsageError(`Could not read ${full}.`);
  }
}

/**
 * The one question before production is written. `--yes` answers it; with no
 * terminal and no `--yes`, the command stops rather than guess. Defaults to no.
 */
export async function confirmWrite(
  question: string,
  options: { yes: boolean; interactive: boolean },
): Promise<boolean> {
  if (options.yes) return true;
  if (!options.interactive) {
    throw new UsageError(
      `${question} Pass --yes to answer yes without a terminal.`,
    );
  }
  return unwrap(await confirm({ message: question, initialValue: false }));
}

/**
 * The shared `catch`: a worded failure is explained and the run exits 1; any
 * other error is unexpected and goes to Sentry with the command's name.
 */
export function reportFailure(
  command: string,
  err: unknown,
  worded: readonly (abstract new (...args: never[]) => Error)[] = [],
): void {
  process.exitCode = 1;
  if (
    err instanceof UsageError ||
    err instanceof ProductionError ||
    worded.some((kind) => err instanceof kind)
  ) {
    explain((err as Error).message, "");
    return;
  }
  explainError(`${command} failed.`, err);
}
