/**
 * The secret values this process has seen, so nothing it prints can carry one.
 *
 * `creds` holds live passwords in memory: it reads them from Bitwarden items
 * and writes them into Send bodies. They must never reach stdout, stderr, the
 * failure log, Sentry or an error message. The code never prints one on
 * purpose, but `bw` writes its own errors, and an error message that quotes its
 * input is one refactor away. So every value is registered the moment it is
 * read, and every string that leaves through an error passes {@link scrub}.
 *
 * Masking in the preview is a separate thing: it never has the value to begin
 * with (see `item.ts`'s `MASK`).
 */

const seen = new Set<string>();

/**
 * Values shorter than this are not registered. Scrubbing a two-character
 * password out of every message would shred the messages and protect nothing
 * a two-character password had left to protect.
 */
const MIN_LENGTH = 4;

/** Records a value that must never be printed. */
export function registerSecret(value: string | null | undefined): void {
  if (value && value.length >= MIN_LENGTH) seen.add(value);
}

export const REDACTED = "<redacted>";

/** `text` with every registered value replaced. Longest first, so a value that contains another is removed whole. */
export function scrub(text: string): string {
  let out = text;
  for (const value of [...seen].sort((a, b) => b.length - a.length)) {
    out = out.split(value).join(REDACTED);
  }
  return out;
}

/** An error whose message has already been scrubbed. Safe to print and report. */
export class CredsError extends Error {
  override name = "CredsError";
  constructor(message: string) {
    super(scrub(message));
  }
}

/** Forgets every value. For tests. */
export function forgetSecrets(): void {
  seen.clear();
}
