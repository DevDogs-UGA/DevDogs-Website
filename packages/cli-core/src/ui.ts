/**
 * Shared prompt plumbing.
 *
 * The audience here is a contributor who may not be comfortable in a terminal
 * at all, so two rules apply throughout:
 *
 *   * Nothing requires knowing a command. Running `pnpm devtools` with no
 *     arguments opens a menu, and every prompt has a sensible default.
 *   * A failure says what to do next. `explain()` exists so no error path
 *     ends at a stack trace.
 */
import { cancel, isCancel, log, note } from "@clack/prompts";
import { isNonInteractive } from "./mode.js";
import { reportDevtoolsError } from "./telemetry.js";

export function bail(message = "Cancelled."): never {
  if (isNonInteractive()) process.stderr.write(`${message}\n`);
  else cancel(message);
  process.exit(1);
}

/** Exits cleanly on Ctrl-C rather than letting a cancel symbol leak onward. */
export function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value;
}

/**
 * Reports a failure with the next thing to try.
 *
 * `hints` is not decoration: for most of these failures the fix is one command,
 * and printing it is the difference between a contributor continuing and a
 * contributor asking in Discord.
 */
export function explain(
  summary: string,
  detail: string,
  hints: string[] = [],
): void {
  // Non-interactive: plain lines on stderr, no clack boxes, so a log reads as
  // a log and stdout stays whatever the command meant it to be.
  if (isNonInteractive()) {
    process.stderr.write(`${summary}\n`);
    if (detail) process.stderr.write(`${detail}\n`);
    for (const hint of hints) process.stderr.write(`  try: ${hint}\n`);
    return;
  }
  log.error(summary);
  if (detail) log.message(detail);
  if (hints.length > 0) note(hints.join("\n"), "Try this");
}

/**
 * A refusal the reader can fix themselves — a name that matches nothing, a
 * flag missing where there is no terminal to ask. Thrown from deep enough
 * that the command's catch can't tell it from a real failure any other way;
 * `explainError` prints it like any other error but keeps it out of Sentry.
 */
export class UsageError extends Error {
  override name = "UsageError";
}

/**
 * `explain()` for a caught error rather than a refusal: prints the same way,
 * with `err`'s message as the detail, and reports `err` to Sentry unless it
 * is a {@link UsageError}. Only failures nobody anticipated belong there.
 */
export function explainError(
  summary: string,
  err: unknown,
  hints: string[] = [],
): void {
  if (!(err instanceof UsageError)) reportDevtoolsError(err);
  explain(summary, errorMessage(err), hints);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Result rendering ─────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * A pass/fail list.
 *
 * Deliberately plain text rather than a box-drawing table: these lines get
 * pasted into Discord and GitHub issues, where anything fancier turns to
 * rubble.
 */
export function renderChecks(checks: CheckResult[]): string {
  return checks
    .map((c) => `${c.ok ? "PASS" : "FAIL"}  ${c.name}\n      ${c.detail}`)
    .join("\n");
}
