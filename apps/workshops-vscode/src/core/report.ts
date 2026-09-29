import { GitError } from "./git.js";

/**
 * The pure half of error reporting (TASK-380): which errors are worth
 * reporting, and scrubbing an event so nothing about the attendee's machine or
 * clone leaves it. No vscode, no Sentry client, so it is tested directly.
 *
 * What may be sent is listed in the README; keep the two in step.
 */

/**
 * An error the attendee is told about and can act on (a refused link, a
 * step they can't switch to because of their own edits). Never reported.
 */
export class ExpectedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExpectedError";
  }
}

/** git failures that come from the attendee's situation, not from a bug here. */
const EXPECTED_GIT = [
  /would be overwritten by (checkout|merge)/i,
  /local changes|uncommitted changes/i,
  /please commit your changes or stash/i,
  /not a git repository/i,
  /could not resolve host|unable to access|could not read from remote|connection (timed out|refused|reset)/i,
  /authentication failed|terminal prompts disabled|permission denied/i,
  /no space left on device/i,
  /unable to (create|write)|cannot lock ref|index\.lock/i,
  /timed out|killed/i,
];

export function isExpectedError(error: unknown): boolean {
  if (error instanceof ExpectedError) return true;
  if (error instanceof GitError) return EXPECTED_GIT.some((p) => p.test(error.stderr));
  // Reading a file the attendee deleted mid-review, a disk that is full, etc.
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && ["ENOENT", "EACCES", "EPERM", "ENOSPC", "EBUSY"].includes(code)) return true;
  return (error as { name?: unknown } | null)?.name === "EntryNotFound (FileSystemError)";
}

// -- consent ----------------------------------------------------------------

export interface ReporterDeps {
  /** `vscode.env.isTelemetryEnabled`, read every time. */
  enabled(): boolean;
  /** Hands the error to the Sentry client. Only ever called when reporting is allowed. */
  send(error: unknown, source: string): void;
}

/**
 * Decides whether an error is reported at all: the client exists (a DSN was
 * baked in), the attendee's telemetry setting is on, and the error is not an
 * expected one. Returns whether it was sent.
 */
export class Reporter {
  constructor(private readonly deps: ReporterDeps | undefined) {}

  capture(error: unknown, source: string): boolean {
    if (!this.deps || !this.deps.enabled() || isExpectedError(error)) return false;
    try {
      this.deps.send(error, source);
      return true;
    } catch {
      return false; // reporting must never cause an error of its own
    }
  }
}

/**
 * Wraps a command handler: an error it throws (or rejects with) is passed to
 * `capture`, then thrown on unchanged, so VS Code still shows it as before.
 */
export function guard<A extends unknown[], R>(
  capture: (source: string, error: unknown) => void,
  source: string,
  handler: (...args: A) => R,
): (...args: A) => R | Promise<R> {
  return (...args) => {
    const fail = (error: unknown): never => {
      capture(source, error);
      throw error;
    };
    try {
      const result = handler(...args);
      return result instanceof Promise ? (result.catch(fail) as Promise<R>) : result;
    } catch (error) {
      return fail(error);
    }
  };
}

// -- scrubbing --------------------------------------------------------------

export interface ScrubContext {
  /** Directories to name instead of showing: the home dir, the clone, workspace folders. */
  paths: readonly string[];
  /** The attendee's GitHub username, which git errors can quote (branch `user/02-supabase`). */
  username?: string | undefined;
}

/** Long messages are usually git or a command's output: keep the first line-ish only. */
export const MAX_MESSAGE = 300;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A path in either slash style, and URL-encoded, as a pattern. */
function pathPattern(path: string): RegExp {
  const trimmed = path.replace(/[\\/]+$/, "");
  const body = escape(trimmed).replace(/\\\\|\//g, "[\\\\/]");
  return new RegExp(body, "gi");
}

const POSIX_PATH = /(?<=^|[\s"'(<=])\/(?:[^\s"'()<>:]+\/)+([^\s"'()<>:]+)/g;
const WINDOWS_PATH = /[A-Za-z]:\\(?:[^\s"'()<>]+\\)*([^\s"'()<>]+)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|[Bb]earer\s+[\w.-]+)/g;
const URL_CREDENTIALS = /(https?:\/\/)[^\s/@]+@/g;

/**
 * Removes what identifies the attendee or their clone from `text`: the paths
 * in `context.paths` (longest first) become `<path>`, any other absolute path
 * shrinks to its file name, and email addresses, tokens, URL credentials and
 * the username are redacted.
 */
export function scrubText(text: string, context: ScrubContext): string {
  let out = text;
  const paths = [...context.paths].filter((p) => p.replace(/[\\/]+$/, "").length > 1).sort((a, b) => b.length - a.length);
  for (const path of paths) out = out.replace(pathPattern(path), "<path>");
  out = out.replace(WINDOWS_PATH, "$1").replace(POSIX_PATH, "$1");
  out = out.replace(URL_CREDENTIALS, "$1").replace(EMAIL, "[email]").replace(SECRET, "[redacted]");
  if (context.username && context.username.length > 1) {
    out = out.replace(new RegExp(`(?<![\\w-])${escape(context.username)}(?![\\w-])`, "gi"), "<user>");
  }
  return out;
}

const scrubMessage = (text: string, context: ScrubContext) => scrubText(text, context).slice(0, MAX_MESSAGE);

/** The parts of a Sentry event we touch; structural so this needs no Sentry types. */
export interface ReportEvent {
  message?: string | undefined;
  exception?: {
    values?: {
      type?: string | undefined;
      value?: string | undefined;
      stacktrace?: { frames?: Record<string, unknown>[] | undefined } | undefined;
    }[] | undefined;
  } | undefined;
  breadcrumbs?: unknown;
  extra?: Record<string, unknown> | undefined;
  contexts?: Record<string, unknown> | undefined;
  user?: unknown;
  request?: unknown;
  server_name?: unknown;
  modules?: unknown;
  [key: string]: unknown;
}

function scrubValue(value: unknown, context: ScrubContext, depth = 0): unknown {
  if (typeof value === "string") return scrubMessage(value, context);
  if (depth > 4) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubValue(v, context, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrubValue(v, context, depth + 1)]),
    );
  }
  return value;
}

/**
 * The `beforeSend` for the client: scrubs messages, exception values, stack
 * frames and extras, and drops everything that could carry file contents or
 * identity (breadcrumbs, source context lines, user, request, server name).
 * Contexts keep only the name and version of the os and runtime.
 */
export function scrubEvent<E extends ReportEvent>(event: E, context: ScrubContext): E {
  const out: ReportEvent = { ...event };
  if (out.message) out.message = scrubMessage(out.message, context);
  if (out.exception) {
    out.exception = {
      values: out.exception.values?.map((ex) => ({
        ...ex,
        value: ex.value === undefined ? undefined : scrubMessage(ex.value, context),
        stacktrace: ex.stacktrace && {
          ...ex.stacktrace,
          frames: ex.stacktrace.frames?.map((frame) => {
            const { context_line, pre_context, post_context, vars, ...rest } = frame;
            void context_line, pre_context, post_context, vars;
            for (const key of ["filename", "abs_path", "module"]) {
              if (typeof rest[key] === "string") rest[key] = scrubText(rest[key], context);
            }
            return rest;
          }),
        },
      })),
    };
  }
  delete out.breadcrumbs;
  delete out.user;
  delete out.request;
  delete out.server_name;
  delete out.modules;
  if (out.extra) out.extra = scrubValue(out.extra, context) as Record<string, unknown>;
  if (out.contexts) {
    // Only the name and version of os and runtime: no kernel string, host or device.
    const kept: Record<string, unknown> = {};
    for (const key of ["os", "runtime"]) {
      const entry = out.contexts[key] as Record<string, unknown> | undefined;
      if (entry && typeof entry === "object") {
        kept[key] = Object.fromEntries(
          ["name", "version"].filter((k) => typeof entry[k] === "string").map((k) => [k, scrubMessage(entry[k] as string, context)]),
        );
      }
    }
    out.contexts = kept;
  }
  return out as E;
}
