/**
 * The small slice of `@devdogsuga/devtools`' `src/ui.ts` this script
 * actually uses. Copied rather than depended on: this package must run
 * standalone from a Backstage checkout, with no repo-resolution machinery
 * and no dependency on devtools at all (see this package's README header).
 */
import { cancel, isCancel, log, note } from "@clack/prompts";

export function bail(message = "Cancelled."): never {
  cancel(message);
  process.exit(1);
}

/** Exits cleanly on Ctrl-C rather than letting a cancel symbol leak onward. */
export function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value;
}

/**
 * Reports a failure with the next thing to try.
 */
export function explain(
  summary: string,
  detail: string,
  hints: string[] = [],
): void {
  log.error(summary);
  if (detail) log.message(detail);
  if (hints.length > 0) note(hints.join("\n"), "Try this");
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
