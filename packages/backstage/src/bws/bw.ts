/**
 * Where the bundled Bitwarden CLI (`bw`) is, for the vault code that signs in
 * and reads the Secrets Manager token (`vault.ts`).
 *
 * There is no `bw` command of ours: `env` runs `bw login` and `bw unlock`
 * itself when it needs the token. The binary is still resolved from
 * `@bitwarden/cli`, never looked up on PATH. A dependency's bin is only linked
 * into the `node_modules/.bin` of the package that depends on it, so under
 * `pnpm dlx` nothing puts `bw` on PATH and a bare `spawn("bw")` is ENOENT.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The `[command, args]` pair that runs the bundled Bitwarden CLI.
 *
 * Runs `build/bw.js` under this Node rather than through a shim, so it works
 * the same wherever backstage is installed. Falls back to `bw` on PATH when the
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
