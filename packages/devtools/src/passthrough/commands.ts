/**
 * `devtools supabase|wrangler|drizzle-kit|psql …`.
 *
 * The underlying tool plus the session's env and tier; everything after the
 * tool name is forwarded untouched, `--help` included (it is the tool's help,
 * not ours). Only `supabase` rewrites arguments (see `supabase.ts`), and only
 * by adding the tier's target. Each run prints the exact command after it
 * finishes, so the tool's own output cannot bury it.
 *
 * These run before `intro()` in `cli.ts`: a banner above another tool's
 * output is this CLI talking over it.
 */
import { nonEmpty, sessionIsLocal } from "@devdogsuga/cli-core/db/connection";
import { reportRan, runInGroup } from "@devdogsuga/cli-core/process-group";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { explain } from "@devdogsuga/cli-core/ui";
import { restartStack } from "../preset/commands.js";
import { runSupabase } from "./supabase.js";

/** Where the user is, if that is inside the repo; the repo root otherwise. */
function workingDirectory(): string {
  const root = findRepoRoot();
  const cwd = process.cwd();
  return cwd === root || cwd.startsWith(`${root}/`) ? cwd : root;
}

async function runPnpmTool(
  tool: string,
  args: readonly string[],
): Promise<number> {
  const full = ["exec", tool, ...args];
  const result = await runInGroup("pnpm", full, { cwd: workingDirectory() });
  reportRan("pnpm", full, result);
  return result.code;
}

/**
 * libpq reads its connection from `PG*` variables, so the session's `DB_URL`
 * becomes the DEFAULT connection and any flag or URI the user passes still
 * wins. The password travels in the environment, not on a command line `ps`
 * can read.
 */
export function psqlEnvironment(
  dbUrl: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const url = new URL(dbUrl);
  const env: NodeJS.ProcessEnv = { ...base };
  const set = (key: string, value: string): void => {
    if (value !== "") env[key] = decodeURIComponent(value);
  };
  set("PGHOST", url.hostname);
  set("PGPORT", url.port);
  set("PGUSER", url.username);
  set("PGPASSWORD", url.password);
  set("PGDATABASE", url.pathname.replace(/^\//, ""));
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  else if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    env.PGSSLMODE = "require";
  }
  return env;
}

async function runPsql(args: readonly string[]): Promise<number> {
  const dbUrl = process.env.DB_URL;
  // Never psql's own defaults: with no DB_URL, libpq would try a Postgres on
  // this machine, which is not the session's database.
  if (!dbUrl) {
    explain(
      `psql needs a database, and this session (${nonEmpty(process.env.DEPLOY_ENV) ?? "development"}) has no DB_URL.`,
      "",
      sessionIsLocal() ? ["pnpm devtools supabase start"] : [],
    );
    return 1;
  }
  const result = await runInGroup("psql", args, {
    cwd: workingDirectory(),
    env: psqlEnvironment(dbUrl),
  });
  reportRan("psql", args, result);
  return result.code;
}

export async function handlePassthrough(
  tool: "supabase" | "wrangler" | "drizzle-kit" | "psql",
  args: string[],
): Promise<void> {
  switch (tool) {
    case "supabase":
      process.exitCode = await runSupabase(args, restartStack);
      return;
    case "psql":
      process.exitCode = await runPsql(args);
      return;
    default:
      process.exitCode = await runPnpmTool(tool, args);
  }
}
