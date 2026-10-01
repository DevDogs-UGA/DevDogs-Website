/**
 * Non-interactive mode: the one definition both published CLIs share.
 *
 * A run is non-interactive when nobody can answer a prompt: no TTY on stdin,
 * or `CI=true`. In that mode there is no wizard and no banner, output is plain
 * lines (errors on stderr), every confirmation needs `--yes`, the tier must be
 * named (`--tier` or `DEPLOY_ENV`), and Sentry reports the environment `ci`.
 * `--no-env` is the companion switch: it skips loading env files, for a job
 * that supplies its own environment.
 */

/** Skip every confirmation. Also the only way past the hosted-tier gate with no terminal. */
export const YES_FLAG = "--yes";

/** Do not load env files; the caller's environment is the environment. */
export const NO_ENV_FLAG = "--no-env";

/** `CI=true` (or `1`), the value every CI runner sets. */
export function isCiEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.CI === "1";
}

/**
 * Whether this run has nobody to ask.
 *
 * Both inputs are injectable for tests; the defaults read the live process.
 */
export function isNonInteractive(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = process.stdin.isTTY === true,
): boolean {
  return !isTTY || isCiEnv(env);
}

/** Whether `--yes` was typed anywhere in `argv`. */
export function hasYes(argv: readonly string[]): boolean {
  return argv.includes(YES_FLAG);
}

/**
 * Pulls `--no-env` out of `argv`, wherever it sits, leaving everything else in
 * order. Like `--tier`, it is a global flag the launcher strips before any
 * command sees the rest.
 */
export function stripNoEnvFlag(argv: readonly string[]): {
  noEnv: boolean;
  rest: string[];
} {
  const rest = argv.filter((arg) => arg !== NO_ENV_FLAG);
  return { noEnv: rest.length !== argv.length, rest };
}
