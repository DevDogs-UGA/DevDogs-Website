/**
 * Writes `.env.generated` — the local Supabase stack's connection block — when
 * the stack is listening and the file is missing or stale, so
 * `supabase start|stop` can stay plain passthroughs and nothing has to be
 * remembered afterwards.
 *
 * Cost: `supabase status -o env` takes about 1.1s, paid once, not per run.
 *
 * Do the values survive a stack restart? Yes: the keys are signed from the
 * `jwt_secret` in `supabase/config.toml` and the ports are pinned there, so a
 * restart reproduces them byte for byte. What does invalidate the file is
 * editing `config.toml` (a new secret or port), so the file counts as stale
 * when `config.toml` is newer than it.
 */
import { execFile } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_FILE } from "./load.js";

export interface EnsureGeneratedOptions {
  root: string;
  /** Is the stack's port answering? Injected so tests need no real socket. */
  probe: () => Promise<boolean>;
  /** Runs `supabase status -o env` at the repo root, returning stdout. */
  status?: (root: string) => Promise<string>;
}

export type EnsureGeneratedResult =
  | { action: "none" }
  | { action: "written" | "refreshed"; file: string }
  | { action: "failed"; reason: string };

function supabaseStatus(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "supabase",
      ["status", "-o", "env"],
      { cwd: root, shell: process.platform === "win32", timeout: 30_000 },
      (err, stdout) => (err ? reject(new Error(err.message)) : resolve(stdout)),
    );
  });
}

function isStale(root: string): boolean {
  const config = join(root, "supabase", "config.toml");
  if (!existsSync(config)) return false;
  return (
    statSync(config).mtimeMs > statSync(join(root, GENERATED_FILE)).mtimeMs
  );
}

export async function ensureGeneratedEnv(
  options: EnsureGeneratedOptions,
): Promise<EnsureGeneratedResult> {
  const { root } = options;
  const exists = existsSync(join(root, GENERATED_FILE));
  if (exists && !isStale(root)) return { action: "none" };
  if (!(await options.probe())) return { action: "none" };

  try {
    const output = await (options.status ?? supabaseStatus)(root);
    // Anything that isn't KEY="value" lines means the CLI printed an error or
    // a banner on stdout; writing that would poison every later run.
    if (!/^[A-Z_]+=/m.test(output)) {
      return { action: "failed", reason: "unexpected output from supabase" };
    }
    writeFileSync(join(root, GENERATED_FILE), output);
    return { action: exists ? "refreshed" : "written", file: GENERATED_FILE };
  } catch (err) {
    return {
      action: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
