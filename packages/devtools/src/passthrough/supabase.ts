/**
 * `devtools supabase …`: the Supabase CLI with the session's tier filled in.
 *
 * What is filled in, and the three rules about it (never the linked project,
 * never `--yes`, never over a flag the user typed), live in
 * `@devdogsuga/cli-core/supabase-args`. This file resolves the session, runs
 * the result, prints what ran, and owns the one command that is refused
 * outright: `config push` on the local tier.
 */
import { confirm } from "@clack/prompts";
import {
  resolveDbConnection,
  sessionIsLocal,
  sessionLabel,
} from "@devdogsuga/cli-core/db/connection";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import { reportRan, runInGroup } from "@devdogsuga/cli-core/process-group";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import {
  classifySupabase,
  isConfigPush,
  planSupabaseArgs,
  type FillPlan,
} from "@devdogsuga/cli-core/supabase-args";
import { explain, unwrap } from "@devdogsuga/cli-core/ui";

/** Where the generated database types come from, since a migration changes them. */
export const TYPES_DB_COMMAND = "pnpm -F @devdogsuga/supabase types:db";

/**
 * The arguments to run `supabase` with, or `null` after explaining why not.
 * `label` prefixes any complaint about the session's database.
 */
export async function planSupabase(
  args: readonly string[],
  label = "devtools supabase",
): Promise<string[] | null> {
  let dbUrl = process.env.DB_URL;
  if (classifySupabase(args) === "db-url") {
    // The connection resolver refuses the two ways a session's DB_URL can lie
    // (local session, hosted URL; hosted session, loopback URL) and says why.
    const connection = await resolveDbConnection({ label });
    if (!connection) return null;
    dbUrl = connection.dbUrl;
  }

  const plan: FillPlan = planSupabaseArgs(args, {
    label: sessionLabel(),
    local: sessionIsLocal(),
    dbUrl,
    projectRef: process.env.PROJECT_REF,
  });
  if (!plan.ok) {
    explain(plan.summary, plan.detail, plan.hints);
    return null;
  }
  return plan.args;
}

/** Runs `pnpm exec supabase <args>` as given, then prints the command. */
export async function runSupabaseRaw(args: readonly string[]): Promise<number> {
  const full = ["exec", "supabase", ...args];
  const result = await runInGroup("pnpm", full, { cwd: findRepoRoot() });
  reportRan("pnpm", full, result);
  return result.code;
}

/**
 * `config push` has nothing to push to on the local tier: the local stack
 * reads `config.toml` when it starts. Explains that and, at a terminal, offers
 * the restart that applies it. Returns the exit code.
 */
export async function refuseLocalConfigPush(
  restart: () => Promise<number>,
): Promise<number> {
  explain(
    "The local stack has no project to push config.toml to.",
    "It reads config.toml when it starts, so restarting the stack is how a " +
      "change there takes effect.",
    isNonInteractive() ? ["pnpm devtools restart-stack"] : [],
  );
  if (isNonInteractive() || isDryRun()) return 1;
  const again = unwrap(
    await confirm({
      message: "Restart the local stack now to apply config.toml?",
      initialValue: true,
    }),
  );
  return again ? restart() : 1;
}

/**
 * The whole `devtools supabase` command. `restart` is the restart-stack
 * preset, injected so this file does not import the presets that import it.
 */
export async function runSupabase(
  args: readonly string[],
  restart: () => Promise<number>,
): Promise<number> {
  if (
    isConfigPush(args) &&
    sessionIsLocal() &&
    classifySupabase(args) !== "none"
  ) {
    return refuseLocalConfigPush(restart);
  }

  const planned = await planSupabase(args);
  if (!planned) return 1;

  const code = await runSupabaseRaw(planned);
  if (code === 0 && !isDryRun() && isMigrationPush(args)) {
    process.stderr.write(
      `Hint: ${TYPES_DB_COMMAND} regenerates the committed database types.\n`,
    );
  }
  return code;
}

function isMigrationPush(args: readonly string[]): boolean {
  const [first, second] = args;
  return (
    (first === "db" && second === "push") ||
    (first === "migration" && second === "up")
  );
}
