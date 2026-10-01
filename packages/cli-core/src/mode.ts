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

/**
 * Pulls a global `--tier <t>` out of `argv`, wherever it sits, leaving every
 * other argument untouched and in its original order.
 *
 * A trailing `--tier` with nothing after it removes just the flag; the
 * missing value then reaches tier resolution as `explicit: undefined`, which
 * falls through to `DEPLOY_ENV`/the sole tier/the prompt exactly as if
 * `--tier` had never been typed, rather than this function guessing. A
 * following token that is itself a flag is treated the same way, NOT consumed
 * as the value (the guard every other flag-value reader keeps): without it,
 * `--tier --help` would swallow the flag as a bogus tier and refuse with
 * "unknown tier" instead of reaching the help bypass.
 */
export function stripTierFlag(argv: readonly string[]): {
  explicit: string | undefined;
  rest: string[];
} {
  const rest = [...argv];
  const index = rest.indexOf("--tier");
  if (index === -1) return { explicit: undefined, rest };
  const value = rest[index + 1];
  const missing = value === undefined || value.startsWith("-");
  rest.splice(index, missing ? 1 : 2);
  return { explicit: missing ? undefined : value, rest };
}

let noEnv = false;

/** Records that `--no-env` was typed, for handlers that behave differently
 * when the caller supplies the environment (backstage's `planner status`). */
export function setNoEnv(value: boolean): void {
  noEnv = value;
}

/** Whether this run was started with `--no-env`. */
export function isNoEnv(): boolean {
  return noEnv;
}
