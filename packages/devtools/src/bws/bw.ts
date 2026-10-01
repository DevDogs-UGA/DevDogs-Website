/**
 * `pnpm devtools bw …`, the Bitwarden CLI passed through untouched.
 *
 * This is not a command of this CLI wearing a Bitwarden hat. Everything after
 * `bw` goes to the real binary verbatim, and its exit code comes back
 * verbatim, because the thing people actually run is `bw login` and its
 * session handling is Bitwarden's business rather than ours.
 *
 * It exists because `@bitwarden/cli` is a dependency of this package, so the
 * binary sits in devtools' own `node_modules/.bin` and nowhere else. Before
 * this, reaching it meant a root alias (`pnpm bw`) that ran
 * `pnpm --filter @devdogsuga/devtools exec bw`, the last script at the
 * workspace root whose whole job was to reach into this package.
 *
 * ⚠️ The binary is resolved from `@bitwarden/cli` itself, never looked up on
 * PATH. A dependency's bin is only linked into the `node_modules/.bin` of the
 * package that depends on it, so under `pnpm dlx`, or with devtools installed
 * in a clone, nothing puts `bw` on PATH and a bare `spawn("bw")` is ENOENT.
 */
import { spawn } from "node:child_process";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { formatCommand } from "@devdogsuga/cli-core/process-group";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The `[command, args]` pair that runs the bundled Bitwarden CLI.
 *
 * Runs `build/bw.js` under this Node rather than through a shim, so it works
 * the same wherever devtools is installed. Falls back to `bw` on PATH when the
 * package cannot be resolved, which keeps a missing install surfacing as the
 * ENOENT every caller already handles.
 */
export function bwCommand(args: string[]): [string, string[]] {
  try {
    const require_ = createRequire(import.meta.url);
    const pkgPath = require_.resolve("@bitwarden/cli/package.json");
    const pkg = require_(pkgPath) as { bin: { bw: string } };
    return [process.execPath, [join(dirname(pkgPath), pkg.bin.bw), ...args]];
  } catch {
    return ["bw", args];
  }
}

/**
 * Runs the Bitwarden CLI with `args`, then exits with its status.
 *
 * Returns a promise that never settles, because every path out of it ends in
 * `process.exit`. That signature is load-bearing rather than pedantic: a
 * `void` return would let the caller carry on and print `outro("Done.")`
 * while `bw login` was still waiting for a master password.
 */
export function runBw(args: string[]): Promise<never> {
  if (isDryRun()) {
    process.stderr.write(`Would run: ${formatCommand("bw", args)}\n`);
    process.exit(0);
  }
  return new Promise<never>(() => {
    const child = spawn(...bwCommand(args), { stdio: "inherit" });

    child.on("error", (err: Error) => {
      // ENOENT here means the dependency is not installed rather than that the
      // user mistyped, so say the thing that fixes it.
      console.error(
        `bw: ${err.message}\n` +
          "The Bitwarden CLI ships as a devtools dependency — " +
          "run `pnpm install` at the repo root.",
      );
      process.exit(1);
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      // Re-raise rather than translating to a number: a Ctrl-C in `bw login`
      // should look to the shell exactly like a Ctrl-C in `bw login`.
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 1);
    });
  });
}
