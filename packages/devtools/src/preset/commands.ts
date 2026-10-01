/**
 * `devtools preset <name>`: the TUI's jobs, each a few tool calls in a row.
 *
 * A preset exists only where it sequences several tools or asks a question
 * between them. It prints the commands it ran (after they finish, on stderr)
 * and may offer one clearly labelled next step; everything else is a
 * passthrough. Hosted tiers are gated by the launcher before any of this runs.
 */
import { confirm, log } from "@clack/prompts";
import { flagValue } from "@devdogsuga/cli-core/args";
import { reportRuns } from "@devdogsuga/cli-core/db/run";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { hasYes, isNonInteractive } from "@devdogsuga/cli-core/mode";
import { reportRan, runInGroup } from "@devdogsuga/cli-core/process-group";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import {
  sessionIsLocal,
  sessionLabel,
} from "@devdogsuga/cli-core/db/connection";
import { explain, unwrap } from "@devdogsuga/cli-core/ui";
import { catalog } from "../catalog.js";
import { runNewMigration } from "../db/new-migration.js";
import { runStackCommand } from "../db/stack.js";
import {
  planSupabase,
  refuseLocalConfigPush,
  runSupabaseRaw,
  TYPES_DB_COMMAND,
} from "../passthrough/supabase.js";

function say(line: string): void {
  if (isNonInteractive()) process.stderr.write(`${line}\n`);
  else log.message(line);
}

/** `supabase stop` then `supabase start`; the only way to pick up config.toml. */
export async function restartStack(): Promise<number> {
  reportRuns(true);
  const { code, lines } = await runStackCommand("restart", null);
  for (const line of lines) say(line);
  return code;
}

async function newMigration(args: string[]): Promise<number> {
  reportRuns(true);
  const app = flagValue(args, "--app");
  const appAt = args.indexOf("--app");
  const description = args.find(
    (arg, i) => !arg.startsWith("-") && !(appAt >= 0 && i === appAt + 1),
  );
  if (isNonInteractive() && (!app || !description)) {
    process.stderr.write(
      "devtools preset new-migration: --app <slug> and a description are " +
        "required when there is no terminal to ask.\n",
    );
    return 1;
  }
  return runNewMigration(app, description);
}

/** `pnpm -F @devdogsuga/supabase run types:db`, run with the session's env. */
async function regenerateTypes(): Promise<number> {
  const args = ["-F", "@devdogsuga/supabase", "run", "types:db"];
  const result = await runInGroup("pnpm", args, { cwd: findRepoRoot() });
  reportRan("pnpm", args, result);
  return result.code;
}

async function applyMigrations(): Promise<number> {
  const planned = await planSupabase(
    ["db", "push"],
    "devtools preset apply-migrations",
  );
  if (!planned) return 1;
  const code = await runSupabaseRaw(planned);
  if (code !== 0) return code;

  // Pushing a migration usually changes the generated types, but regenerating
  // them rewrites a committed file, so it is a question rather than a step.
  if (isNonInteractive()) {
    process.stderr.write(
      `Hint: ${TYPES_DB_COMMAND} regenerates the committed database types.\n`,
    );
    return 0;
  }
  const types = unwrap(
    await confirm({
      message: "Regenerate the committed database types now (types:db)?",
      initialValue: true,
    }),
  );
  return types ? regenerateTypes() : 0;
}

async function pushConfig(args: string[]): Promise<number> {
  if (sessionIsLocal()) return refuseLocalConfigPush(restartStack);

  // The diff first, always: `config push` proceeds without asking when it has
  // no terminal, and a value the file declares only because `supabase init`
  // wrote it can overwrite a deliberate hosted setting.
  const diff = await planSupabase(
    ["config", "diff"],
    "devtools preset push-config",
  );
  if (!diff) return 1;
  const diffCode = await runSupabaseRaw(diff);
  if (diffCode !== 0) return diffCode;

  if (isNonInteractive()) {
    if (!hasYes(args)) {
      process.stderr.write(
        "devtools preset push-config: --yes is required to push with no " +
          "terminal to confirm. The diff is above.\n",
      );
      return 1;
    }
  } else {
    const push = unwrap(
      await confirm({
        message: `Push config.toml to ${sessionLabel()} (project ${process.env.PROJECT_REF ?? "unknown"})?`,
        initialValue: false,
      }),
    );
    if (!push) {
      say("Left the project alone.");
      return 1;
    }
  }

  const planned = await planSupabase(
    ["config", "push"],
    "devtools preset push-config",
  );
  if (!planned) return 1;
  return runSupabaseRaw(planned);
}

export const handlePreset: CommandHandler = async (rest) => {
  const [name, ...args] = rest;
  let code: number;
  switch (name) {
    case "restart-stack":
      code = await restartStack();
      break;
    case "new-migration":
      code = await newMigration(args);
      break;
    case "apply-migrations":
      code = await applyMigrations();
      break;
    case "push-config":
      code = await pushConfig(args);
      break;
    default:
      explain(
        name
          ? `devtools preset: unknown preset "${name}".`
          : "devtools preset: which one?",
        `Try ${catalog.subcommandList(["preset"])}.`,
      );
      process.exitCode = 1;
      return null;
  }
  process.exitCode = code;
  return code === 0 ? DONE : null;
};
