import { spawnProcess } from "@devdogsuga/cli-core/spawn";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Stream the child's output to this terminal (and capture nothing). */
  inherit?: boolean;
}

/** Runs a program. Injected into the product commands so tests do not spawn. */
export type Runner = (
  command: string,
  args: readonly string[],
  options: RunOptions,
) => Promise<RunResult>;

export const spawnRunner: Runner = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

/** `command arg arg`, quoted only where a shell would need it. For messages. */
export function commandLine(command: string, args: readonly string[]): string {
  return [command, ...args]
    .map((part) =>
      /^[\w@%+=:,./-]+$/.test(part) ? part : JSON.stringify(part),
    )
    .join(" ");
}
