/**
 * devtools' own Sentry wiring — the CLI is a consumer of
 * `@devdogsuga/telemetry` like `apps/platform`, `apps/schedule-builder`, and
 * `apps/sandbox`, but on `@sentry/node` rather than a framework SDK: a CLI
 * process starts, runs one command, and exits, with none of a server's
 * request lifecycle for a framework integration to hook into.
 *
 * ## Reporting is on by default
 *
 * Every other `*_SENTRY_DSN` in this org is optional-and-empty until
 * configured (see `@devdogsuga/telemetry`'s no-op-without-DSN contract), and
 * so is this one — empty means `buildSentryOptions` returns `undefined` and
 * `Sentry.init` never runs — but the DEFAULT here is reporting ON once a DSN
 * exists, unlike a feature a contributor opts into. `DEVTOOLS_TELEMETRY=0` is
 * the one escape hatch, checked before `Sentry.init` and before every capture
 * call, so it also works as a kill switch after init already ran (a
 * long-lived `pnpm devtools` menu session, for instance).
 *
 * ## Where the DSN comes from
 *
 * Baked in at build time, not read from the consumer's environment: devtools
 * runs on contributors' machines, where no `.env` could be relied on to carry
 * it. `scripts/write-build-info.mjs` writes `dist/build-info.json` from the
 * build's `DEVTOOLS_SENTRY_DSN`, which Backstage's `publish.yaml` sets from
 * the repo's Actions variable of the same name. Every other build bakes ""
 * and reports nothing. `DEVTOOLS_SENTRY_DSN` in the run-time environment still
 * wins, for pointing a local build at a test project.
 */
import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import { noteError } from "./failure-log.js";
import { isNonInteractive } from "./mode.js";
import { discoverRepoRoot } from "./repo/root.js";
import { ownVersion } from "./version.js";

/** The DSN baked into this build, or "" if there is none (a source run under
 * tsx, or a build made without `DEVTOOLS_SENTRY_DSN`). */
function bakedSentryDsn(): string {
  try {
    const info = JSON.parse(
      readFileSync(new URL("./build-info.json", import.meta.url), "utf8"),
    ) as { sentryDsn?: unknown };
    return typeof info.sentryDsn === "string" ? info.sentryDsn : "";
  } catch {
    return "";
  }
}

/** The run-time `DEVTOOLS_SENTRY_DSN` if set, else the baked one. */
export function resolveDevtoolsDsn(
  env: NodeJS.ProcessEnv,
  baked: string,
): string {
  // An empty override (`DEVTOOLS_SENTRY_DSN=`) must fall back to the baked DSN.
  const override = env.DEVTOOLS_SENTRY_DSN ?? "";
  return override || baked;
}

let initialized = false;

/** The id of the last event this process sent to Sentry, if any. */
let lastEventId: string | undefined;

/**
 * The Sentry event id of the last error or failure this run reported, or
 * `undefined` when telemetry is off or sent nothing. Printed with the failure
 * log so a maintainer can find the event.
 */
export function lastSentryEventId(): string | undefined {
  return lastEventId;
}

/** Records the id only when a client exists: without one nothing was sent. */
function sent(id: string): void {
  if (Sentry.getClient()) lastEventId = id;
}

/**
 * `'ci'` whenever the run is non-interactive (no TTY, or `CI=true`, which the
 * runner sets itself before any workflow-authored env), `'local'` on a
 * contributor's terminal.
 * One of `@devdogsuga/telemetry`'s `ENVIRONMENTS`.
 */
export function devtoolsEnvironment(): "ci" | "local" {
  return isNonInteractive() ? "ci" : "local";
}

/**
 * `DEVTOOLS_TELEMETRY=0` (any other value, including unset, leaves reporting
 * on) is the only opt-out. Checked by both `initDevtoolsTelemetry` (skips
 * `Sentry.init` outright) and `captureDevtoolsError` (so setting it mid-run,
 * or between two invocations in the same process, still works).
 */
export function devtoolsTelemetryEnabled(): boolean {
  return process.env.DEVTOOLS_TELEMETRY !== "0";
}

/**
 * Whether anyone is actually using devtools in this process. Package-registry
 * scanners install every published version within minutes and run it in a
 * throwaway sandbox (random `DESKTOP-xxxxxx` hosts, Firecracker VMs, a fuzzer
 * that turns `process.exit` into a throw). Left unfiltered, each release filed
 * the same two issues from them. They run with no DevDogsUGA checkout and no
 * terminal. A person has at least one of the two (`setup` runs outside a
 * checkout, but in a terminal), and CI always has a checkout.
 */
export function hasRealCaller(inRepo: boolean, isTTY: boolean): boolean {
  return inRepo || isTTY;
}

/**
 * Initializes `@sentry/node` for this CLI process. Safe to call more than
 * once (idempotent) and safe to call with no DSN configured (no-ops via
 * `buildSentryOptions`, see its header).
 *
 * `command` becomes a `command` tag on every event this process reports, so
 * an issue in Sentry names the subcommand it came from (`db reset`,
 * `deploy platform`, …) without anyone opening the job log first.
 */
export function initDevtoolsTelemetry(command: string): void {
  if (initialized) return;
  initialized = true;

  if (!devtoolsTelemetryEnabled()) return;
  if (
    !hasRealCaller(discoverRepoRoot() !== null, process.stdin.isTTY === true)
  ) {
    return;
  }

  const options = buildSentryOptions({
    service: "devtools",
    environment: devtoolsEnvironment(),
    dsn: resolveDevtoolsDsn(process.env, bakedSentryDsn()),
    // The published version, so an issue names the release it came from; a
    // dlx run has no SENTRY_RELEASE of its own.
    release: `devtools@${ownVersion()}`,
  });
  if (!options) return;

  Sentry.init(options);
  Sentry.getCurrentScope().setTag("command", command);
}

/**
 * Reports an error nothing below the entry points caught — `launch.ts`'s
 * `dispatch`, `launch-ci.ts`, and the bins — then flushes before the process
 * exits. Node's event loop dies with `process.exit`, taking any in-flight
 * request to Sentry's ingest endpoint with it, so the flush must be awaited
 * BEFORE that call — never after.
 *
 * A short timeout: a CLI exiting on error should not hang perceptibly longer
 * because Sentry's ingest is slow or unreachable.
 */
export async function captureDevtoolsError(err: unknown): Promise<void> {
  noteError(err);
  if (!devtoolsTelemetryEnabled()) return;
  sent(Sentry.captureException(err));
  await Sentry.flush(2000);
}

/**
 * Reports an error a command caught and explained to the reader itself
 * (`explainError` in `ui.ts`, `devtools-ci deploy`'s catch), then carried on
 * to a normal exit. Not flushed: the SDK's in-flight request keeps the event
 * loop alive until it lands, so a natural exit waits for it on its own. A
 * path that ends in `process.exit` instead must use `captureDevtoolsError`.
 */
export function reportDevtoolsError(err: unknown): void {
  noteError(err);
  if (!devtoolsTelemetryEnabled()) return;
  sent(Sentry.captureException(err));
}

/**
 * Reports a failure that has no error object — a subprocess or deploy step
 * that exited non-zero. Same no-flush contract as `reportDevtoolsError`.
 */
export function reportDevtoolsFailure(
  message: string,
  extra: Record<string, unknown> = {},
): void {
  noteError(new Error(message));
  if (!devtoolsTelemetryEnabled()) return;
  sent(Sentry.captureMessage(message, { level: "error", extra }));
}

/**
 * Reports a warning-level message under a FIXED fingerprint, then flushes.
 *
 * For the deprecated aliases: every use groups into one Sentry issue per
 * fingerprint, so the issue's last-seen time says when the alias stopped
 * being used and is safe to remove. Flushed because the callers go on to
 * `process.exit`, which would otherwise drop the request in flight. The
 * timeout is short: the command being run is what the person came for.
 */
export async function captureDevtoolsDeprecation(
  message: string,
  fingerprint: string,
  tags: Record<string, string>,
): Promise<void> {
  if (!devtoolsTelemetryEnabled()) return;
  Sentry.captureMessage(message, {
    level: "warning",
    fingerprint: [fingerprint],
    tags,
  });
  await Sentry.flush(1000);
}
