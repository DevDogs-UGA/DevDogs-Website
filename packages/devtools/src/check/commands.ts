/**
 * `devtools check <migrations|env|workers|scripts>`.
 *
 * Each check returns a list of problems; this prints them as plain lines (on
 * stderr when there are any, so a CI log reads the same with or without a
 * terminal) and exits 1. Passing prints one line and exits 0.
 */
import { flagValue } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { catalog } from "../catalog.js";
import { checkEnv } from "./env.js";
import { checkMigrationOrder } from "./migrations.js";
import { checkScripts } from "./scripts.js";
import { checkWorkers } from "./workers.js";

const DEFAULT_BASE = "origin/main";

function report(name: string, problems: readonly string[], ok: string): number {
  if (problems.length === 0) {
    process.stdout.write(`check ${name}: ${ok}\n`);
    return 0;
  }
  process.stderr.write(
    `check ${name}: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`,
  );
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  return 1;
}

function migrations(rest: string[]): number {
  const base = flagValue(rest, "--base") ?? DEFAULT_BASE;
  const { baseLatest, violations } = checkMigrationOrder(findRepoRoot(), base);
  return report(
    "migrations",
    violations.map(
      (v) =>
        `${v.filename} (${v.timestamp}) sorts before ${base}'s newest migration (${baseLatest}). ` +
        "Recreate it with a fresh timestamp (`devtools preset new-migration`) and regenerate types.",
    ),
    `in order (${base}'s newest: ${baseLatest ?? "none"}).`,
  );
}

async function run(rest: string[]): Promise<number> {
  const [sub] = rest;
  switch (sub) {
    case "migrations":
      return migrations(rest.slice(1));
    case "env":
      return report("env", await checkEnv(findRepoRoot()), "all declared.");
    case "workers":
      return report("workers", checkWorkers(findRepoRoot()), "in step.");
    case "scripts":
      return report(
        "scripts",
        checkScripts(findRepoRoot()),
        "the vocabulary holds.",
      );
    default:
      process.stderr.write(
        sub
          ? `devtools check: unknown check "${sub}". Try ${catalog.subcommandList(["check"])}.\n`
          : `devtools check: which of ${catalog.subcommandList(["check"])}?\n`,
      );
      return 1;
  }
}

export const handleCheck: CommandHandler = async (rest) => {
  let code: number;
  try {
    code = await run(rest);
  } catch (err) {
    // A git or filesystem failure is a failed check, not a crash.
    process.stderr.write(
      `devtools check: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    code = 1;
  }
  process.exitCode = code;
  return code === 0 ? DONE : null;
};
