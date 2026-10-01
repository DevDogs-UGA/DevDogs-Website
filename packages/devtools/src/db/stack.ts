/**
 * The local Supabase stack's lifecycle: `start`, `stop` and the `restart`
 * preset.
 *
 * `start` writes `.env.generated` and seeds the storage buckets, which is what
 * the deprecated `db start` alias on DevDogsUGA's main relies on until the
 * cutover; `with-env` takes the file over after it. `stop` leaves the file
 * alone: `with-env` already ignores it while the stack is down.
 */
import { writeFile } from "node:fs/promises";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { join } from "node:path";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import {
  foreignStackMessage,
  foreignStackProjectId,
  listContainerNames,
  STACK_API_PORT,
  readProjectId,
} from "@devdogsuga/cli-core/repo/supabase-project";
import {
  seedBuckets,
  supabase,
  supabaseCapture,
} from "@devdogsuga/cli-core/db/run";
import { refreshSessionEnv } from "./session-refresh.js";

export const STACK_COMMANDS = ["start", "stop", "restart"] as const;
export type StackCommand = (typeof STACK_COMMANDS)[number];

// ── Implementations ──────────────────────────────────────────────────────────

/**
 * A running Docker container whose name says it belongs to a DIFFERENT
 * Supabase project than this checkout's own `config.toml` — the signature
 * of a foreign stack holding the shared ports (see
 * `repo/supabase-project.ts`'s header). `undefined` when nothing points
 * that way, including when Docker or `config.toml` could not be read at
 * all: with no signal either way, `startLocalStack`'s own failure and the
 * Supabase CLI's own output are still the reader's best explanation.
 */
function foreignStackHint(): string | undefined {
  const names = listContainerNames(STACK_API_PORT);
  if (names === null) return undefined;
  const foreign = foreignStackProjectId(names, readProjectId(findRepoRoot()));
  return foreign === null ? undefined : foreignStackMessage(foreign);
}

/**
 * `wroteEnvFile` is split out from `code` on purpose: `.env.generated` is
 * written to disk BEFORE `seedBuckets` runs, so a nonzero `code` from
 * `seedBuckets` alone does not mean the file on disk is unchanged — the
 * fresh connection block is already there, a later `db start` retry or the
 * probe table would already see it, and this process's OWN entered
 * environment is now the stale one. `afterLocalStackChange` below refreshes
 * whenever the file changed, independently of whether the command as a whole
 * succeeded, and still reports the failing code so the caller does not
 * mistake a seed failure for success.
 *
 * `hint` is set when `supabase start` itself fails (before anything here
 * could have written `.env.generated`) AND a foreign project's stack is
 * holding the ports — the same signal `db/generated-env.ts` surfaces for a
 * failed `supabase status -o env`, named here too so `db start` explains
 * itself instead of leaving only the bare Supabase CLI error.
 */
async function startLocalStack(): Promise<{
  code: number;
  wroteEnvFile: boolean;
  hint?: string;
}> {
  const code = await supabase("start");
  // The start above only printed. Nothing is running to read a status from,
  // and `.env.generated` must not be written for a stack that never started.
  if (isDryRun()) {
    process.stderr.write("Would write .env.generated from the running stack\n");
    return { code: 0, wroteEnvFile: false };
  }
  if (code !== 0) {
    const hint = foreignStackHint();
    return hint === undefined
      ? { code, wroteEnvFile: false }
      : { code, wroteEnvFile: false, hint };
  }
  // Write the local stack's connection details so with-env can load them.
  let env: string;
  try {
    env = await supabaseCapture("status", "-o", "env");
  } catch {
    return { code: 1, wroteEnvFile: false };
  }
  await writeFile(join(findRepoRoot(), ".env.generated"), env);
  const bucketsCode = await seedBuckets({ kind: "local" });
  return { code: bucketsCode, wroteEnvFile: true };
}

async function stopLocalStack(): Promise<number> {
  return supabase("stop");
}

/**
 * BUG 2's fix, applied at every point `start`/`stop`/`restart` can change
 * `.env.generated`: on success, refresh this process's entered environment
 * (see `db/session-refresh.ts`) so the rest of the session — including a
 * `db introspect` run right after this one — sees the stack's CURRENT
 * connection, not whatever `process.env` held at launch. A failed stack
 * command USUALLY changed nothing on disk, so by default there is nothing to
 * refresh.
 *
 * `wroteEnvFile` is the one exception: `startLocalStack` writes
 * `.env.generated` BEFORE the buckets-seed step that can still fail
 * afterwards, so a nonzero `code` from THAT failure does not mean the file on
 * disk is unchanged — see `startLocalStack`'s own doc. Passing `true` here
 * refreshes regardless of `code`, while the failing code itself still reaches
 * the caller untouched, so `db start` is still reported as failed even though
 * the session's environment was brought current.
 */
async function afterLocalStackChange(
  code: number,
  wroteEnvFile = false,
): Promise<string[]> {
  if (isDryRun() || (code !== 0 && !wroteEnvFile)) return [];
  return refreshSessionEnv();
}

// ── The local stack's lifecycle ──────────────────────────────────────────────

/**
 * Stop, then start again.
 *
 * Two steps rather than one, because `supabase restart` does not exist. The
 * CLI's own answer to a changed `config.toml` is a stop/start pair. Doing it
 * here turns that into one menu entry, rather than two commands the contributor
 * has to know to run in that order.
 *
 * A failed stop short-circuits. Starting a stack that never went down would
 * report success and leave the config change unapplied, which is the one
 * outcome worse than a visible failure.
 */
async function restartLocal(): Promise<{ code: number; lines: string[] }> {
  const stopCode = await stopLocalStack();
  if (stopCode !== 0) {
    return {
      code: stopCode,
      lines: [
        "Stopping failed, so nothing was restarted. " +
          "Scroll up for the output from the Supabase CLI.",
      ],
    };
  }
  const { code, wroteEnvFile, hint } = await startLocalStack();
  const lines = await afterLocalStackChange(code, wroteEnvFile);
  return { code, lines: hint === undefined ? lines : [hint, ...lines] };
}

/**
 * Runs a stack lifecycle command, returning its exit code and anything to
 * report. The lifecycle commands act on this machine's containers and so need
 * no resolvable database (that is what `start` is FOR).
 */
export async function runStackCommand(
  command: StackCommand,
): Promise<{ code: number; lines: string[] }> {
  if (command === "restart") return restartLocal();

  if (command === "stop") {
    const code = await stopLocalStack();
    return { code, lines: await afterLocalStackChange(code) };
  }

  const { code, wroteEnvFile, hint } = await startLocalStack();
  const lines = await afterLocalStackChange(code, wroteEnvFile);
  return { code, lines: hint === undefined ? lines : [hint, ...lines] };
}
