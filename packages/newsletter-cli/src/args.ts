/**
 * Minimal positional-argument reader, scoped to the four value flags this
 * script's own CLI accepts. Ported from `@devdogsuga/devtools`' `src/args.ts`
 * (see its header for the bug this shape prevents: a naive
 * `filter(!startsWith("--"))` reads a flag's VALUE as a positional), trimmed
 * to just the flags `commands.ts` here defines — the original's `VALUE_FLAGS`
 * set also covered a couple dozen unrelated devtools commands that do not
 * exist in this standalone script.
 */
const VALUE_FLAGS = new Set(["--format", "--out", "--mailbox", "--send"]);

export function positionals(argv: readonly string[]): string[] {
  const found: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (!arg.startsWith("-")) {
      found.push(arg);
      continue;
    }

    const next = argv[i + 1];
    if (VALUE_FLAGS.has(arg) && next !== undefined && !next.startsWith("-")) {
      i += 1;
    }
  }

  return found;
}
