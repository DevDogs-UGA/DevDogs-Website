import { homedir } from "node:os";
import {
  NodeClient,
  Scope,
  defaultStackParser,
  makeNodeTransport,
} from "@sentry/node";
import * as vscode from "vscode";
import {
  Reporter,
  guard,
  scrubEvent,
  trackOfRepo,
  type ReportEvent,
  type ScrubContext,
} from "../core/index.js";
import { output } from "./log.js";

/**
 * Error reporting (TASK-380). Set up so it can only ever send what the README
 * lists:
 *
 * - **A standalone client.** `new NodeClient` with its own `Scope`, never
 *   `Sentry.init()`: extensions share one process, and `init` would hook
 *   globals (uncaught exceptions, console, http) and capture every other
 *   extension's errors. No integrations at all, so nothing is hooked.
 * - **Only with a baked-in DSN.** `esbuild.mjs` defines `__WORKSHOPS_SENTRY_DSN__`
 *   from `WORKSHOPS_VSCODE_SENTRY_DSN` at publish; a local build has none and
 *   reports nothing.
 * - **Only while VS Code's telemetry setting is on**, checked on every capture.
 * - **Errors only, scrubbed** (`core/report.ts`), with no breadcrumbs.
 */

declare const __WORKSHOPS_SENTRY_DSN__: string;

export class Telemetry implements vscode.Disposable {
  private readonly scope: Scope | undefined;
  private readonly client: NodeClient | undefined;
  private readonly reporter: Reporter;
  private readonly disposables: vscode.Disposable[] = [];
  private scrubContext: () => ScrubContext = () => ({ paths: [homedir()] });

  constructor(
    context: vscode.ExtensionContext,
    dsn: string = __WORKSHOPS_SENTRY_DSN__,
  ) {
    if (dsn) {
      const client = new NodeClient({
        dsn,
        release: `workshops-vscode@${(context.extension.packageJSON as { version: string }).version}`,
        environment:
          context.extensionMode === vscode.ExtensionMode.Production
            ? "production"
            : "development",
        integrations: [],
        transport: makeNodeTransport,
        stackParser: defaultStackParser,
        sendDefaultPii: false,
        sendClientReports: false,
        // Belt and braces: nothing queued leaves after telemetry is turned off.
        beforeSend: (event) =>
          vscode.env.isTelemetryEnabled
            ? (scrubEvent(
                event as unknown as ReportEvent,
                this.scrubContext(),
              ) as unknown as typeof event)
            : null,
      });
      const scope = new Scope();
      scope.setClient(client);
      client.init();
      scope.setTags({
        vscode_version: vscode.version,
        platform: process.platform,
      });
      this.client = client;
      this.scope = scope;
    }
    this.reporter = new Reporter(
      this.scope
        ? {
            enabled: () => vscode.env.isTelemetryEnabled,
            send: (error, source) =>
              void this.scope!.clone()
                .setTag("source", source)
                .captureException(error),
          }
        : undefined,
    );
    this.disposables.push(
      vscode.env.onDidChangeTelemetryEnabled((on) => {
        if (this.client)
          output.appendLine(
            `Error reporting ${on ? "on" : "off"} (VS Code's telemetry setting).`,
          );
      }),
    );
  }

  /** Whether an error would be sent right now. */
  get active(): boolean {
    return this.scope !== undefined && vscode.env.isTelemetryEnabled;
  }

  /** What to strip from events: computed when an event is sent, so it is current. */
  setScrubContext(fn: () => ScrubContext): void {
    this.scrubContext = fn;
  }

  /** The tag for the workshop track, once a repo is open. */
  setRepo(repo: string | undefined): void {
    const track = repo ? trackOfRepo(repo) : undefined;
    this.scope?.setTag("track", track);
  }

  capture(source: string, error: unknown): void {
    this.reporter.capture(error, source);
  }

  async flush(): Promise<void> {
    await this.client?.flush(2000);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    void this.client?.close(2000);
  }
}

let current: Telemetry | undefined;

export function useTelemetry(telemetry: Telemetry | undefined): void {
  current = telemetry;
}

/** Reports an error nothing else handled. Never throws; expected errors are filtered out. */
export function captureError(source: string, error: unknown): void {
  current?.capture(source, error);
}

/** Wraps a command handler so an unexpected error is reported, then thrown on as before. */
export function guarded<A extends unknown[], R>(
  source: string,
  handler: (...args: A) => R,
): (...args: A) => R | Promise<R> {
  return guard(captureError, source, handler);
}
