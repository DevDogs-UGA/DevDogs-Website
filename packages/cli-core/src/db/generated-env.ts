/**
 * Regenerating `.env.generated` from a Supabase stack that is ALREADY
 * running — started by `db start` in THIS checkout, sure, but just as
 * often by another workspace (a different clone or worktree of the
 * DevDogsUGA repo) that shares this repo's `project_id`. `supabase status`
 * finds containers by project id, not by which checkout ran `db start`, so
 * a stack a sibling workspace brought up answers for THIS checkout too —
 * except `.env.generated` (the connection block `startLocalStack`,
 * the CLI's `db/stack.ts`, writes) only ever lands in the workspace that actually ran
 * it. Left alone, this checkout sees port 54321 listening with the file
 * missing, and `@devdogsuga/env/load`'s `selectEnvFiles` either warns (an
 * unqualified session) or throws `LocalStackOfflineError` (an explicit
 * `development:local` one) — both of which used to mean the contributor
 * ran `supabase status -o env > .env.generated` by hand.
 *
 * `ensureGeneratedEnvFile` does that automatically, before a session's env
 * files ever load: `enterSessionEnvironment` (`../env-entry.ts`) calls it on
 * every command dispatch, and `db status` (the CLI's `db/stack.ts`) calls it to
 * report the file's state accurately instead of trusting a stale absence.
 * Both are read-only from THIS checkout's point of view — nothing here
 * starts, stops, or resets anything; it only reads a port, a file, and
 * (best-effort) the stack's own connection block.
 *
 * The other failure this covers: `supabase status -o env` itself fails
 * because what is listening on 54321 belongs to a DIFFERENT Supabase
 * project — a stack this repo's own `project_id` rename left orphaned, or
 * an unrelated project entirely. That is reported (`"foreign"`) rather than
 * silently falling through to the existing offline handling, which would
 * otherwise just repeat "nothing is listening" advice for a port that very
 * much has something listening on it.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeployEnvironment } from "@devdogsuga/env";
import type { DevDatabase } from "@devdogsuga/env/load";
import { supabaseCapture } from "./run.js";
import { findRepoRoot } from "../repo/root.js";
import {
  foreignStackMessage,
  foreignStackProjectId,
  listContainerNames,
  STACK_API_PORT,
  readProjectId,
} from "../repo/supabase-project.js";

/** The file this module writes and checks — see `@devdogsuga/env/load`'s
 *  `GENERATED_FILE`, duplicated as a literal rather than imported so this
 *  module never has to load the `@devdogsuga/env` peer just for one
 *  constant. Keep in sync if that constant's value ever changes. */
const GENERATED_FILE = ".env.generated";

export interface EnsureGeneratedEnvDeps {
  /** Is anything listening on the local stack port? Injected so tests never
   *  open a real socket. */
  probeLocalStack: () => boolean | Promise<boolean>;
  /** File existence, relative to `repoRoot`. Injected so tests never touch
   *  a real filesystem. */
  exists: (file: string) => boolean;
  /** `supabase status -o env`'s stdout, or a rejection when the CLI fails —
   *  most commonly because the stack on 54321 belongs to a different
   *  project. Injected so tests never spawn the real CLI. */
  captureStatus: () => Promise<string>;
  /** Writes `.env.generated`'s full path. Injected so tests never touch a
   *  real filesystem. */
  write: (path: string, contents: string) => Promise<void>;
  /** `docker ps --format '{{.Names}}'`, pre-split — or `null` when Docker
   *  could not be read. Injected so tests never spawn a real subprocess. */
  listContainerNames: () => string[] | null;
  /** This checkout's own `project_id`, or `null` if unreadable. Injected so
   *  tests never touch a real filesystem. */
  projectId: () => string | null;
  /** Used only to build the path `write` receives. */
  repoRoot: string;
}

export type EnsureGeneratedEnvResult =
  | { outcome: "skipped" }
  | { outcome: "wrote"; line: string }
  | { outcome: "foreign"; projectId: string; line: string }
  | { outcome: "unreachable" };

/**
 * Regenerates `.env.generated` from a running local stack when THIS
 * checkout's own copy is missing.
 *
 * A no-op (`"skipped"`) unless every one of these holds: `tier` is
 * `"development"`, `devDatabase` is not `"remote"` (an explicit `"local"`
 * or the probe-decides `undefined` both qualify), the file is genuinely
 * absent, and something answers the local stack's port. That last check
 * also covers "the file is missing because the stack is genuinely down" —
 * nothing here runs `supabase status` against a stack that is not there;
 * the existing `LocalStackOfflineError`/warning handling covers that case
 * exactly as before.
 *
 * `"foreign"` and `"unreachable"` both mean `supabase status -o env`
 * itself failed — the port answered, but the CLI could not produce a
 * connection block. `"foreign"` is the case a running Docker container's
 * name resolves to: another project's stack holds the port.
 * `"unreachable"` is everything else (an unreadable `config.toml`, an
 * unreadable `docker ps`, a container name that matches nobody) — the
 * caller falls through to its existing offline handling either way, since
 * `.env.generated` is still missing on disk.
 */
export async function ensureGeneratedEnvFile(
  tier: DeployEnvironment,
  devDatabase: DevDatabase | undefined,
  deps: EnsureGeneratedEnvDeps,
): Promise<EnsureGeneratedEnvResult> {
  if (tier !== "development" || devDatabase === "remote") {
    return { outcome: "skipped" };
  }
  if (deps.exists(GENERATED_FILE)) return { outcome: "skipped" };
  if (!(await deps.probeLocalStack())) return { outcome: "skipped" };

  try {
    const env = await deps.captureStatus();
    await deps.write(join(deps.repoRoot, GENERATED_FILE), env);
    return {
      outcome: "wrote",
      line: "devtools: wrote .env.generated from the running local stack",
    };
  } catch {
    const names = deps.listContainerNames();
    const foreign =
      names === null ? null : foreignStackProjectId(names, deps.projectId());
    if (foreign !== null) {
      return {
        outcome: "foreign",
        projectId: foreign,
        line: `devtools: ${foreignStackMessage(foreign)}`,
      };
    }
    return { outcome: "unreachable" };
  }
}

/**
 * The production wiring for `EnsureGeneratedEnvDeps`, shared by
 * `../env-entry.ts` (via `realEnvEntryDeps`) and `../stack.ts`'s `db
 * status`. `probeLocalStack` is passed in rather than resolved here because
 * both callers already hold the loaded `@devdogsuga/env/load` peer their
 * own dispatch needs anyway — resolving it again here would mean two
 * different copies of the same optional peer in play.
 */
export function realEnsureGeneratedEnvDeps(
  probeLocalStack: () => boolean | Promise<boolean>,
): EnsureGeneratedEnvDeps {
  const repoRoot = findRepoRoot();
  return {
    probeLocalStack,
    exists: (file) => existsSync(join(repoRoot, file)),
    captureStatus: () => supabaseCapture("status", "-o", "env"),
    write: (path, contents) => writeFile(path, contents),
    listContainerNames: () => listContainerNames(STACK_API_PORT),
    projectId: () => readProjectId(repoRoot),
    repoRoot,
  };
}
