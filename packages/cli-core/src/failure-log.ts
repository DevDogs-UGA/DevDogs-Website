/**
 * A local log for a failed run, so a contributor has something to attach to
 * #tech-support.
 *
 * When the process is about to exit non-zero, one file is written holding what
 * helps someone else diagnose it: the command line, the version and platform,
 * the tool commands that ran with their exit codes, devtools' own output, the
 * error, and the Sentry event id when telemetry sent one. The path is printed
 * last, on stderr. Output a tool wrote straight to the terminal is not
 * captured (tools keep the terminal so colours and prompts work), and the log
 * says so.
 *
 * Secrets are redacted before anything is stored: credentials inside URLs,
 * and the value of any environment variable named like a secret.
 *
 * Not a failure, so no log: a clean exit, Ctrl-C (130) or SIGTERM (143), the
 * drift code (2) that `--check` uses on purpose, and a cancelled prompt.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform, release } from "node:os";
import { join } from "node:path";
import { EXIT_DRIFT } from "./catalog.js";
import { ownVersion } from "./version.js";

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  return value;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function versionOrUnknown(): string {
  try {
    return ownVersion();
  } catch {
    return "unknown";
  }
}

/** How much of devtools' own output the log keeps, from the end. */
const OUTPUT_LIMIT = 64 * 1024;
/** How many logs stay on disk. */
const KEEP = 10;

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|KEY|DSN|DB_URL|CREDENTIAL)/i;
const URL_CREDENTIALS = /\/\/[^/@\s:]+(:[^/@\s]*)?@/g;

interface State {
  argv: string[];
  eventId: () => string | undefined;
  ran: string[];
  output: string;
  error: unknown;
  quiet: boolean;
}

let state: State | null = null;

/** Replaces credentials in `text` with a placeholder. */
export function redact(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let out = text.replace(URL_CREDENTIALS, "//***@");
  for (const [name, value] of Object.entries(env)) {
    if (value && value.length >= 8 && SECRET_NAME.test(name)) {
      out = out.split(value).join("<redacted>");
    }
  }
  return out;
}

export function failureLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    nonEmpty(env.DEVTOOLS_LOG_DIR) ??
    join(
      nonEmpty(env.XDG_STATE_HOME) ?? join(homedir(), ".local", "state"),
      "devdogs",
      "logs",
    )
  );
}

/** Whether an exit code means the run failed. */
export function isFailureCode(code: number): boolean {
  return code !== 0 && code !== EXIT_DRIFT && code !== 130 && code !== 143;
}

export interface LogInput {
  argv: readonly string[];
  code: number;
  ran: readonly string[];
  output: string;
  error: unknown;
  eventId: string | undefined;
  now: Date;
  env?: NodeJS.ProcessEnv;
}

/** The file's text. Pure, so it is testable without a process to fail. */
export function renderFailureLog(input: LogInput): string {
  const env = input.env ?? process.env;
  const lines = [
    "devtools failure log",
    "Attach this file to your #tech-support message.",
    "",
    `time:      ${input.now.toISOString()}`,
    `version:   ${versionOrUnknown()}`,
    `command:   devtools ${input.argv.join(" ")}`,
    `exit code: ${input.code}`,
    `tier:      ${nonEmpty(env.DEPLOY_ENV) ?? "development"}`,
    `node:      ${process.version}`,
    `platform:  ${platform()} ${release()}`,
    `cwd:       ${process.cwd()}`,
    `sentry:    ${input.eventId ?? "none (telemetry sent nothing)"}`,
    "",
    "== Tool commands that ran ==",
    ...(input.ran.length > 0 ? input.ran : ["(none)"]),
    "",
    "== Error ==",
  ];
  if (input.error === undefined) lines.push("(none thrown)");
  else {
    lines.push(
      input.error instanceof Error
        ? (input.error.stack ?? input.error.message)
        : describe(input.error),
    );
  }
  lines.push(
    "",
    "== devtools output (tool output that went straight to the terminal is not here) ==",
    input.output.length > 0 ? input.output : "(none)",
  );
  return redact(`${lines.join("\n")}\n`, env);
}

/** Records a command a tool ran, for the log. */
export function noteRan(line: string): void {
  state?.ran.push(line);
}

/** Records the error a failure came from, for the log. */
export function noteError(error: unknown): void {
  if (state) state.error ??= error;
}

/** A cancelled prompt is the user's choice, not a failure. */
export function suppressFailureLog(): void {
  if (state) state.quiet = true;
}

function keepNewest(dir: string): void {
  try {
    const old = readdirSync(dir)
      .filter((name) => name.startsWith("devtools-") && name.endsWith(".log"))
      .sort()
      .slice(0, -KEEP);
    for (const name of old) rmSync(join(dir, name), { force: true });
  } catch {
    // Pruning is housekeeping; a failure here must not hide the real one.
  }
}

/** Writes the log and returns its path, or `null` if it could not be written. */
function writeLog(input: LogInput): string | null {
  try {
    const dir = failureLogDir(input.env);
    mkdirSync(dir, { recursive: true });
    const stamp = input.now.toISOString().replace(/[:.]/g, "-");
    const path = join(dir, `devtools-${stamp}.log`);
    writeFileSync(path, renderFailureLog(input), { mode: 0o600 });
    keepNewest(dir);
    return path;
  } catch {
    return null;
  }
}

/**
 * Starts recording and writes the log if the process exits with a failure.
 * Call once, early. A second call is ignored.
 */
export function installFailureLog(options: {
  argv: readonly string[];
  eventId: () => string | undefined;
}): void {
  if (state) return;
  state = {
    argv: [...options.argv],
    eventId: options.eventId,
    ran: [],
    output: "",
    error: undefined,
    quiet: false,
  };

  const capture = (stream: NodeJS.WriteStream): void => {
    const original = stream.write.bind(stream);
    stream.write = (chunk: string | Uint8Array, ...rest: never[]) => {
      if (state && typeof chunk === "string") {
        state.output = (state.output + chunk).slice(-OUTPUT_LIMIT);
      }
      return original(chunk, ...rest);
    };
  };
  capture(process.stdout);
  capture(process.stderr);

  process.once("exit", (exitCode) => {
    const current = state;
    if (!current || current.quiet) return;
    const code =
      process.exitCode === undefined ? exitCode : Number(process.exitCode);
    if (!isFailureCode(code)) return;
    const path = writeLog({
      argv: current.argv,
      code,
      ran: current.ran,
      output: current.output,
      error: current.error,
      eventId: current.eventId(),
      now: new Date(),
    });
    const eventId = current.eventId();
    process.stderr.write(
      [
        path
          ? `Log for #tech-support: ${path}`
          : "Could not write a failure log.",
        ...(eventId ? [`Sentry event: ${eventId}`] : []),
        "",
      ].join("\n"),
    );
  });
}
