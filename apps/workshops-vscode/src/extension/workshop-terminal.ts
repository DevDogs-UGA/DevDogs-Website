import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { git } from "../core/index.js";
import { resolveBash } from "./bash.js";
import { logError, output } from "./log.js";

/**
 * The extension's own "Workshop" terminal, always bash (see `bash.ts`). With
 * shell integration it waits for the real exit code, so the review only moves
 * on after success. Without bash, or without shell integration after a few
 * seconds, it types the line into a shell and reports "sent": we can't see
 * the result, so the attendee confirms with "I ran it". Commands are sent one
 * line at a time and never chained.
 */

export type RunResult =
  | { kind: "exit"; code: number | undefined }
  /** Typed into a shell we can't watch. */
  | { kind: "sent" };

const INTEGRATION_WAIT_MS = 5000;

export class WorkshopTerminal implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private cwd: string | undefined;
  private bash: string | undefined | null = null; // null: not looked up yet
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.subscriptions.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.terminal) this.terminal = undefined;
      }),
    );
  }

  private async findBash(root: string): Promise<string | undefined> {
    if (this.bash !== null) return this.bash;
    let gitExecPath: string | undefined;
    if (process.platform === "win32") {
      try {
        gitExecPath = (await git(root, ["--exec-path"])).trim();
      } catch (error) {
        logError("git --exec-path", error);
      }
    }
    this.bash = resolveBash({ platform: process.platform, gitExecPath, env: process.env, exists: existsSync });
    return this.bash;
  }

  private async ensure(root: string): Promise<{ terminal: vscode.Terminal; bash: boolean }> {
    const bash = await this.findBash(root);
    if (!this.terminal || this.terminal.exitStatus !== undefined || this.cwd !== root) {
      this.terminal?.dispose();
      this.terminal = vscode.window.createTerminal({
        name: "Workshop",
        cwd: root,
        ...(bash ? { shellPath: bash } : {}),
      });
      this.cwd = root;
    }
    return { terminal: this.terminal, bash: bash !== undefined };
  }

  private waitForIntegration(terminal: vscode.Terminal): Promise<vscode.TerminalShellIntegration | undefined> {
    if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);
    return new Promise((resolve) => {
      const done = (value: vscode.TerminalShellIntegration | undefined) => {
        listener.dispose();
        clearTimeout(timer);
        resolve(value);
      };
      const listener = vscode.window.onDidChangeTerminalShellIntegration((e) => {
        if (e.terminal === terminal) done(e.shellIntegration);
      });
      const timer = setTimeout(() => done(terminal.shellIntegration), INTEGRATION_WAIT_MS);
    });
  }

  /** Runs one command; resolves when it ends (exit code) or once it has been typed (sent). */
  async run(command: string, root: string): Promise<RunResult> {
    const { terminal, bash } = await this.ensure(root);
    terminal.show(true);
    const integration = bash ? await this.waitForIntegration(terminal) : undefined;

    if (integration) {
      output.appendLine(`$ ${command}`);
      return new Promise<RunResult>((resolve) => {
        const execution = integration.executeCommand(command);
        const finish = (result: RunResult) => {
          end.dispose();
          closed.dispose();
          resolve(result);
        };
        const end = vscode.window.onDidEndTerminalShellExecution((e) => {
          if (e.execution === execution) finish({ kind: "exit", code: e.exitCode });
        });
        // Closing the terminal mid-command must not leave the review waiting forever.
        const closed = vscode.window.onDidCloseTerminal((t) => {
          if (t === terminal) finish({ kind: "exit", code: undefined });
        });
      });
    }

    for (const line of command.split(/\r?\n/).filter((l) => l.trim() !== "")) {
      terminal.sendText(line, true);
    }
    return { kind: "sent" };
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
    this.terminal?.dispose();
  }
}
