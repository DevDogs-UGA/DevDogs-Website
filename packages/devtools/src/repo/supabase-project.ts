/**
 * This repo's Supabase project id — read from `supabase/config.toml` — and
 * the container-name conventions the Supabase CLI derives from it.
 *
 * Shared by `environment.ts`'s adaptive-menu probe (does a stack answer for
 * THIS project?) and the foreign-stack detection in `db/generated-env.ts`
 * and `stack.ts` (does a DIFFERENT project's stack hold the shared ports? —
 * the case where `supabase status -o env` fails not because nothing is
 * running, but because what is running on 127.0.0.1:54321 belongs to
 * another workspace, or to this same repo before/after a `project_id`
 * rename). One project-id reader and one container-name parser, so both
 * questions agree on what "this project" means.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads `project_id` out of `<repoRoot>/supabase/config.toml`, or `null`
 * when the file is missing or unparsable.
 *
 * Regex, not a TOML parser: it is one line, the shape has been stable
 * across every CLI version this repo has seen, and a parser on a path some
 * callers pay before their first real subprocess is a cost that stays
 * invisible until it is why the tool feels slow.
 */
export function readProjectId(repoRoot: string): string | null {
  try {
    const path = join(repoRoot, "supabase", "config.toml");
    const match = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(
      readFileSync(path, "utf8"),
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The Supabase CLI's container name prefix for a project id, or the bare
 * `supabase_db_` fallback when the id could not be read.
 *
 * Falling back to the bare prefix means a machine whose `config.toml`
 * cannot be read still detects *a* stack, at the cost of over-matching a
 * differently-named project — deliberate, and unchanged from this
 * function's original home in `environment.ts`: over-matching offers
 * `stop`/a foreign-stack hint for a stack that turns out to be this
 * project's own, which is harmless to see and decline, while
 * under-matching hides a real signal entirely.
 */
export function containerPrefix(projectId: string | null): string {
  return projectId ? `supabase_db_${projectId}` : "supabase_db_";
}

/**
 * The local stack's API port, published by its Kong container. Mirrors
 * `@devdogsuga/env/load`'s `LOCAL_STACK_PORT`, which this module cannot import
 * statically (that package is an optional peer, loaded on demand).
 */
export const STACK_API_PORT = 54321;

function defaultExec(file: string, args: string[]): string | null {
  try {
    return execFileSync(file, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
  } catch {
    return null;
  }
}

/**
 * `docker ps --format '{{.Names}}'`, split into trimmed, non-empty names —
 * or `null` when Docker could not be read at all (no daemon, not
 * installed, timed out). With `publish`, only the containers publishing that
 * host port. `execute` is injectable for tests, mirroring `environment.ts`'s
 * own probes.
 */
export function listContainerNames(
  publish?: number,
  execute: (file: string, args: string[]) => string | null = defaultExec,
): string[] | null {
  const filter =
    publish === undefined ? [] : ["--filter", `publish=${publish}`];
  const out = execute("docker", ["ps", ...filter, "--format", "{{.Names}}"]);
  if (out === null) return null;
  return out
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Finds the `supabase_kong_<id>` container among `names` whose id differs
 * from `projectId` — the signature of a stack started from a DIFFERENT
 * Supabase project (this same repo before/after a rename, or another
 * project entirely) holding the shared ports. Kong is the container that
 * publishes the API port, so callers pass the names `listContainerNames`
 * returns for `STACK_API_PORT`: that names the stack actually on 54321,
 * not just any Supabase stack on the machine.
 *
 * Returns that foreign id, or `null` when every matching container belongs
 * to this project, none match at all, or `projectId` itself could not be
 * read — with no known id of our own, there is nothing to compare against,
 * and guessing would risk telling a contributor their OWN stack is
 * foreign.
 */
export function foreignStackProjectId(
  names: readonly string[],
  projectId: string | null,
): string | null {
  if (projectId === null) return null;
  for (const name of names) {
    const match = /^supabase_kong_(.+)$/.exec(name);
    if (!match) continue;
    const id = match[1]!;
    if (id !== projectId) return id;
  }
  return null;
}

/**
 * The actionable message for a detected foreign stack — shared by
 * `db/generated-env.ts` (a failed `supabase status -o env`) and `stack.ts`
 * (a failed `supabase start`), so both name the same fix in the same
 * words.
 */
export function foreignStackMessage(foreignProjectId: string): string {
  return (
    `The stack on port ${STACK_API_PORT} belongs to project "${foreignProjectId}", not ` +
    "this checkout's. Stop it with `supabase stop --project-id " +
    `${foreignProjectId}\` then \`pnpm devtools db start\`.`
  );
}
