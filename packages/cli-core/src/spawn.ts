/**
 * The one way the CLIs start another program.
 *
 * Node cannot launch `npx`, `pnpm`, `supabase` or any other `.cmd` shim on
 * Windows by name: `spawn("npx")` fails with `ENOENT` because the file on
 * disk is `npx.cmd`, and since CVE-2024-27980 a `.cmd`/`.bat` file will not
 * start at all unless it runs through `cmd.exe` with its arguments escaped for
 * it. Passing `shell: true` instead hands the arguments to the shell unescaped
 * (a path with a space, or an `&` in a URL, then changes what runs).
 *
 * `cross-spawn` does both halves: it looks the command up on `PATH`/`PATHEXT`
 * the way a shell would, and when the result is a shim it runs it through
 * `cmd.exe` with the arguments escaped twice, as `cmd.exe` needs. Elsewhere it
 * is `child_process.spawn`. Everything that starts a program in this package
 * goes through the three functions below, so the Windows handling lives in
 * one place; a bare `child_process` import in the CLI sources is a bug.
 * `git`, `docker` and `node` are real executables and need nothing special,
 * but go through here too so no caller has to know which commands are shims.
 */
import type { ChildProcess, SpawnOptions } from "node:child_process";
import crossSpawn from "cross-spawn";

export type { ChildProcess, SpawnOptions };

/** `child_process.spawn`, but able to start Windows `.cmd` shims. */
export function spawnProcess(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): ChildProcess {
  return crossSpawn(command, [...args], options);
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Kill the child after this many milliseconds. */
  timeout?: number;
  /** Defaults to ignoring stdin and stderr, capturing stdout. */
  stdio?: SpawnOptions["stdio"];
}

/** What a failed {@link execSync} / {@link exec} throws: `execFileSync`'s shape. */
export interface ExecError extends Error {
  code?: string | number;
  status?: number | null;
  stdout: string;
  stderr: string;
}

function execError(
  message: string,
  extra: Partial<ExecError> & { stdout?: string; stderr?: string },
): ExecError {
  return Object.assign(new Error(message), {
    stdout: "",
    stderr: "",
    ...extra,
  });
}

/**
 * `execFileSync(command, args, { encoding: "utf8" })` for a command that may
 * be a Windows shim. Returns stdout; throws an {@link ExecError} when the
 * program cannot start (`code: "ENOENT"`), times out, or exits non-zero.
 */
export function execSync(
  command: string,
  args: readonly string[],
  options: ExecOptions = {},
): string {
  const result = crossSpawn.sync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "ignore"],
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.error) {
    throw execError(result.error.message, {
      code: (result.error as NodeJS.ErrnoException).code,
      stdout,
      stderr,
    });
  }
  if (result.status !== 0) {
    throw execError(
      `Command failed: ${command} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`,
      {
        code: result.status ?? undefined,
        status: result.status,
        stdout,
        stderr,
      },
    );
  }
  return stdout;
}

/** The async twin of {@link execSync}: resolves `{ stdout, stderr }`. */
export function exec(
  command: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      options.timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill();
          }, options.timeout);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(
        execError(error.message, {
          code: (error as NodeJS.ErrnoException).code,
          stdout,
          stderr,
        }),
      );
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0 && !timedOut) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        execError(
          timedOut
            ? `Command timed out: ${command}`
            : `Command failed: ${command} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`,
          { code: code ?? undefined, status: code, stdout, stderr },
        ),
      );
    });
  });
}
