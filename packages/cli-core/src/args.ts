/**
 * Positional arguments, with flag values excluded.
 *
 * Its own module because of one bug it prevents. The first positional is the
 * subcommand, and `pull`, `push` and `audit` do very different things to live
 * credentials. A naive `filter((a) => !a.startsWith("--"))` reads a flag's
 * VALUE as a positional, so `env --file notes.env audit` fails loudly:
 * `notes.env` is not a subcommand and the command refuses. The quiet version
 * is the one that matters:
 *
 *     env --file push audit
 *
 * which runs `push`, writing to Bitwarden and GitHub, when the caller asked
 * for `audit`, which writes nothing at all.
 */

/**
 * Flags that consume the token after them.
 */
export const VALUE_FLAGS = new Set([
  "--access-token",
  // `graphics`: so `graphics --format og brand/club` reads `og` as the format
  // and `brand/club` as the graphic, not both as graphics.
  "--format",
  "--out",
  "--version",
  "--app",
  "--apps",
  "--base-url",
  "--file",
  "--source",
  "--target",
  "--tier",
  "--cron",
  // `jobs`: so `cron --kind sync` reads `sync` as the kind, not a subcommand.
  "--kind",
  "--workflow",
  "--params",
  "--port",
  "--preview-url",
  "--db-url",
  "--user",
  "--filter",
  "--shell",
]);

export function positionals(argv: readonly string[]): string[] {
  const found: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (!arg.startsWith("-")) {
      found.push(arg);
      continue;
    }

    // Skip the value, but only if it looks like one. `--file --yes` is a
    // mistake, and swallowing `--yes` would turn it into a silent one.
    const next = argv[i + 1];
    if (VALUE_FLAGS.has(arg) && next !== undefined && !next.startsWith("-")) {
      i += 1;
    }
  }

  return found;
}

/**
 * The value after `flag`, or `undefined` when the flag is absent or is
 * followed by another flag instead of a value.
 */
export function flagValue(rest: string[], flag: string): string | undefined {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  const value = rest[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}
