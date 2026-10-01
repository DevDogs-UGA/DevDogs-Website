/**
 * Running a child tool so that stopping it stops everything it started.
 *
 * `pnpm run dev` forks a shell that forks vinext that forks workerd. Killing
 * only the pnpm process (what a plain `child.kill()` does, and what a closed
 * terminal tab or a `kill` from another window delivers) orphans the rest,
 * and the orphan keeps its port. So the child gets its own process group, and
 * every stop signal this process receives is sent to the whole group.
 *
 * Ctrl-C needs the same care in reverse: a child in its own group is not in
 * the terminal's foreground group, so the terminal no longer delivers ^C to
 * it. The signal handlers below forward it.
 *
 * The group is only swept after the direct child exits when that exit was a
 * signal we forwarded; a child that exits on its own is left to have cleaned
 * up after itself, so a tool that deliberately leaves a daemon running keeps it.
 */
import { spawn } from "node:child_process";

export interface ToolRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Defaults to `"inherit"`: the tool owns the terminal. */
  stdio?: "inherit" | "ignore";
}

export interface ToolResult {
  /** The exit code; `128 + n` for a death by signal `n`, like a shell. */
  code: number;
  signal: NodeJS.Signals | null;
}

const FORWARDED: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
const SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGTERM: 15,
  SIGKILL: 9,
};

/** How long a group gets to leave after SIGTERM before SIGKILL. */
const GRACE_MS = 5000;

/** Sends `signal` to every process in `pid`'s group. False if it is already gone. */
export function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
    return true;
  } catch {
    return false;
  }
}

export function runInGroup(
  command: string,
  args: readonly string[],
  opts: ToolRunOptions = {},
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      stdio: opts.stdio ?? "inherit",
      cwd: opts.cwd,
      env: opts.env,
      detached: process.platform !== "win32",
    });
    const pid = child.pid;

    let forwarded: NodeJS.Signals | null = null;
    let escalation: NodeJS.Timeout | undefined;

    const forward = (signal: NodeJS.Signals): void => {
      if (pid === undefined) return;
      forwarded ??= signal;
      signalGroup(pid, signal);
      escalation ??= setTimeout(() => signalGroup(pid, "SIGKILL"), GRACE_MS);
      escalation.unref();
    };
    const handlers = FORWARDED.map((signal) => {
      const handler = (): void => forward(signal);
      process.on(signal, handler);
      return [signal, handler] as const;
    });
    // Last resort when this process dies without a signal of its own.
    const onExit = (): void => {
      if (pid !== undefined) signalGroup(pid, "SIGKILL");
    };
    process.on("exit", onExit);

    const finish = (result: ToolResult): void => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
      process.off("exit", onExit);
      if (escalation) clearTimeout(escalation);
      if (forwarded !== null && pid !== undefined) signalGroup(pid, "SIGKILL");
      resolve(result);
    };

    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      finish({ code: 1, signal: null });
    });
    child.on("exit", (code, signal) => {
      const bySignal = signal ? 128 + (SIGNAL_NUMBERS[signal] ?? 0) : 1;
      finish({ code: code ?? bySignal, signal });
    });
  });
}

// ── Printing what ran ────────────────────────────────────────────────────────

const URL_CREDENTIALS = /\/\/[^/@\s]*@/;

/**
 * The command as a person would type it, for printing. A database URL carries
 * its password, so the value after `--db-url` (and any URL with credentials)
 * is replaced rather than echoed.
 */
export function formatCommand(
  command: string,
  args: readonly string[],
): string {
  const shown: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--db-url" && i + 1 < args.length) {
      shown.push(arg, "<DB_URL>");
      i += 1;
    } else if (arg.startsWith("--db-url=")) {
      shown.push("--db-url=<DB_URL>");
    } else {
      shown.push(arg.replace(URL_CREDENTIALS, "//***@"));
    }
  }
  return [command, ...shown]
    .map((part) =>
      /^[\w@%+=:,./<>*-]+$/.test(part) ? part : JSON.stringify(part),
    )
    .join(" ");
}

/**
 * Prints the exact command that ran, AFTER it ran so the tool's own output
 * cannot bury it. On stderr, so a tool whose stdout is a pipe stays clean.
 */
export function reportRan(
  command: string,
  args: readonly string[],
  result: ToolResult,
): void {
  const status = result.code === 0 ? "" : `  (exit ${result.code})`;
  process.stderr.write(`Ran: ${formatCommand(command, args)}${status}\n`);
}
