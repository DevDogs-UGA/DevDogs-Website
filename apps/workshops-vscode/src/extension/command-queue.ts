/**
 * The order step commands run in. A review opens with each `Run:` command from
 * the range's tags, in order; the next one is only offered once the one before
 * it succeeded, and the file diffs wait until all are done (so
 * `package.json` edits a command already made drop out of the review).
 *
 * "sent" is the no-shell-integration path: the line went to their default
 * shell and we can't see the exit code, so they confirm with "I ran it".
 */

export type CommandState = "pending" | "running" | "done" | "failed" | "sent";

export interface CommandItem {
  command: string;
  state: CommandState;
  /** Exit code of a failed run, when known. */
  exitCode?: number | undefined;
}

export class CommandQueue {
  readonly items: CommandItem[];

  constructor(commands: readonly string[]) {
    this.items = commands.map((command) => ({ command, state: "pending" }));
  }

  get allDone(): boolean {
    return this.items.every((i) => i.state === "done");
  }

  get running(): boolean {
    return this.items.some((i) => i.state === "running");
  }

  /** Index of the first command not yet done, or -1. */
  get nextIndex(): number {
    return this.items.findIndex((i) => i.state !== "done");
  }

  /** A command may run when every one before it is done and nothing is running. */
  canRun(index: number): boolean {
    const item = this.items[index];
    if (!item || this.running) return false;
    if (item.state === "done") return false;
    return this.items.slice(0, index).every((i) => i.state === "done");
  }

  start(index: number): void {
    if (this.canRun(index)) this.items[index]!.state = "running";
  }

  /**
   * Records the outcome: exit 0 is done, a non-zero code fails, and an
   * unknown code (shell integration gave none) is left as "sent" for the
   * attendee to confirm rather than guessed.
   */
  finish(index: number, exitCode: number | undefined): void {
    const item = this.items[index];
    if (!item) return;
    if (exitCode === 0) item.state = "done";
    else if (exitCode === undefined) item.state = "sent";
    else {
      item.state = "failed";
      item.exitCode = exitCode;
    }
  }

  /** The line was typed into a shell we can't watch. */
  sent(index: number): void {
    const item = this.items[index];
    if (item) item.state = "sent";
  }

  /** "I ran it". */
  confirm(index: number): void {
    const item = this.items[index];
    if (item && item.state !== "done") item.state = "done";
  }

  /** Puts a failed or sent command back so it can run again. */
  retry(index: number): void {
    const item = this.items[index];
    if (item && (item.state === "failed" || item.state === "sent")) item.state = "pending";
  }
}
