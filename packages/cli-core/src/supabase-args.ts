/**
 * Which arguments `devtools supabase …` fills in from the session's tier.
 *
 * The Supabase CLI picks its target from flags: `--db-url`, `--project-ref`,
 * `--local`, `--linked`. Left to itself it acts on whatever project this
 * checkout happens to be linked to, which is rarely the tier the session
 * names. So devtools adds the flag the session implies, with three rules:
 *
 *   * a flag the user typed always wins (`--local`, `--linked`, `--db-url`,
 *     `--project-ref`, and `gen types`' `--project-id`): nothing is added;
 *   * it NEVER falls back to the linked project: a project-scoped command on
 *     a tier with no project stops and says why;
 *   * it NEVER adds `--yes`: the Supabase CLI's own prompts stay on.
 *
 * `--db-url` is preferred wherever the command takes one (it names the exact
 * database, password and all). `--project-ref` is for the commands that act on
 * a project rather than a database. The tables below are what each Supabase CLI
 * command accepts, verified against `supabase <command> --help` (2.117);
 * a command in neither passes through untouched (`start`, `stop`, `status`,
 * `migration new`, `functions serve`, …), because they target this machine.
 */

export type FillKind = "db-url" | "project-ref" | "project-ref-linked" | "none";

/** Command paths (leading words) that accept `--db-url`. */
const DB_URL_COMMANDS: readonly (readonly string[])[] = [
  ["db", "push"],
  ["db", "reset"],
  ["db", "pull"],
  ["db", "dump"],
  ["db", "diff"],
  ["db", "lint"],
  ["db", "advisors"],
  ["db", "query"],
  ["db", "test"],
  ["migration", "list"],
  ["migration", "up"],
  ["migration", "repair"],
  ["migration", "fetch"],
  ["gen", "types"],
  ["inspect", "db"],
  ["inspect", "report"],
  ["test", "db"],
];

/** Project-scoped commands: `--project-ref` only. */
const PROJECT_COMMANDS: readonly (readonly string[])[] = [
  ["config", "push"],
  ["config", "diff"],
  ["link"],
  ["functions", "deploy"],
  ["functions", "list"],
  ["functions", "delete"],
  ["functions", "download"],
  ["secrets"],
  ["branches"],
  ["backups"],
  ["domains"],
];

/**
 * Project-scoped commands that choose between `--local` and a project, and
 * reject a bare `--project-ref` as ambiguous: it needs `--linked` beside it.
 * That does not read the checkout's link state; `--project-ref` still names
 * the target.
 */
const PROJECT_OR_LOCAL_COMMANDS: readonly (readonly string[])[] = [
  ["seed", "buckets"],
  ["storage"],
];

/** A flag the user typed that already says which target they mean. */
const TARGET_FLAGS = [
  "--local",
  "--linked",
  "--db-url",
  "--project-ref",
  "--project-id",
];

function typedTarget(args: readonly string[]): boolean {
  return args.some((arg) =>
    TARGET_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
  );
}

/** The command's leading words, up to the first flag. */
export function commandPath(args: readonly string[]): string[] {
  const path: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) break;
    path.push(arg);
  }
  return path;
}

function matches(
  path: readonly string[],
  table: readonly (readonly string[])[],
): boolean {
  return table.some(
    (entry) =>
      entry.length <= path.length && entry.every((word, i) => path[i] === word),
  );
}

export function classifySupabase(args: readonly string[]): FillKind {
  if (args.includes("--help") || args.includes("-h")) return "none";
  if (typedTarget(args)) return "none";
  const path = commandPath(args);
  if (matches(path, DB_URL_COMMANDS)) return "db-url";
  if (matches(path, PROJECT_OR_LOCAL_COMMANDS)) return "project-ref-linked";
  if (matches(path, PROJECT_COMMANDS)) return "project-ref";
  return "none";
}

/** `supabase config push`, which gets its own handling on the local tier. */
export function isConfigPush(args: readonly string[]): boolean {
  const path = commandPath(args);
  return path[0] === "config" && path[1] === "push";
}

/** What the session says about its target. */
export interface SupabaseSession {
  /** Names the session in messages: `development:local`, `staging`, … */
  label: string;
  /** The Docker stack on this machine: no project, only a local database. */
  local: boolean;
  dbUrl: string | undefined;
  projectRef: string | undefined;
}

export type FillPlan =
  | { ok: true; args: string[]; filled: string[] }
  | { ok: false; summary: string; detail: string; hints: string[] };

export function planSupabaseArgs(
  args: readonly string[],
  session: SupabaseSession,
): FillPlan {
  const kind = classifySupabase(args);
  const command = `supabase ${commandPath(args).join(" ")}`.trim();
  const passthrough = { ok: true as const, args: [...args], filled: [] };

  if (kind === "none") return passthrough;

  if (kind === "db-url") {
    if (!session.dbUrl) {
      return {
        ok: false,
        summary: `\`${command}\` needs a database, and ${session.label} has no DB_URL.`,
        detail:
          "Without --db-url the Supabase CLI would use the linked project, so devtools stops instead.",
        hints: session.local
          ? ["pnpm devtools supabase start"]
          : ["Add DB_URL to this tier's env file, or pass --db-url yourself."],
      };
    }
    return {
      ok: true,
      args: [...args, "--db-url", session.dbUrl],
      filled: ["--db-url"],
    };
  }

  if (session.local) {
    if (kind === "project-ref-linked") {
      return { ok: true, args: [...args, "--local"], filled: ["--local"] };
    }
    return noProject(command, session);
  }
  if (!session.projectRef) return noProject(command, session);

  return kind === "project-ref-linked"
    ? {
        ok: true,
        args: [...args, "--project-ref", session.projectRef, "--linked"],
        filled: ["--project-ref", "--linked"],
      }
    : {
        ok: true,
        args: [...args, "--project-ref", session.projectRef],
        filled: ["--project-ref"],
      };
}

function noProject(command: string, session: SupabaseSession): FillPlan {
  return {
    ok: false,
    summary: `\`${command}\` acts on a Supabase project, and ${session.label} has none.`,
    detail:
      "Without --project-ref the Supabase CLI acts on whatever project this " +
      "checkout is linked to, which may not be the one you mean, so devtools " +
      "stops here instead of guessing.",
    hints: session.local
      ? [
          "pnpm devtools --tier development:remote supabase " +
            command.replace(/^supabase /, ""),
          "or --tier staging / --tier production",
        ]
      : [
          "Add PROJECT_REF to this tier's env file, or pass --project-ref yourself.",
        ],
  };
}
