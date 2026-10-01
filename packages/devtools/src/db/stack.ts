/**
 * Database commands, over the session's database.
 *
 * Previously delegated to `@devdogsuga/supabase` package scripts by name,
 * then to a `--target local|remote` flag; now every data command acts on the
 * ONE database the session entered (see `db/connection.ts`), passed to the
 * supabase CLI as an explicit `--db-url`. That uniformity is load-bearing:
 * the CLI's own defaults disagree per subcommand (`db push` defaults to the
 * LINKED project, `db reset` to `--local`), and `--db-url` is the one
 * spelling that can neither fall back to `supabase link`'s ambient state
 * nor quietly pick a different database than the session says.
 *
 * The stack-lifecycle commands (`start`/`stop`/`restart`) are the deliberate
 * exception: they act on this machine's Docker containers, which no DB_URL
 * names, and they run under any session — starting your local stack while
 * the session targets staging is odd but harmless, and refusing it would
 * block the one command that fixes an offline-local session.
 */
import { existsSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  describeEnvironment,
  probeEnvironment,
} from "@devdogsuga/cli-core/environment";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import {
  foreignStackMessage,
  foreignStackProjectId,
  listContainerNames,
  STACK_API_PORT,
  readProjectId,
} from "@devdogsuga/cli-core/repo/supabase-project";
import {
  dbPush,
  generateTypes,
  seedBuckets,
  supabase,
  supabaseCapture,
} from "@devdogsuga/cli-core/db/run";
import {
  describeDbTarget,
  isLocalConnection,
  type DbConnection,
} from "@devdogsuga/cli-core/db/connection";
import { refreshSessionEnv } from "./session-refresh.js";
import { runSeedProduction } from "./seed-production.js";
import { originReachable, resolveBaseUrl } from "../cron/commands.js";
import {
  ensureGeneratedEnvFile,
  realEnsureGeneratedEnvDeps,
} from "@devdogsuga/cli-core/db/generated-env";
import { loadEnvLoad } from "@devdogsuga/cli-core/repo/peers";

// Scope order, matching `db`'s subcommands in `commands.ts`: the four that
// act on the Supabase stack (`connect` is handled separately below — it
// takes a positional ref), then the two that write the Postgres database
// inside the session's endpoint.
export const STACK_COMMANDS = [
  "start",
  "stop",
  "restart",
  "status",
  "migrate",
  "reset",
] as const;
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
  const code = await supabase("stop");
  if (code !== 0) return code;
  rmSync(join(findRepoRoot(), ".env.generated"), { force: true });
  return 0;
}

/**
 * `db connect [<project-ref>]` — run `supabase link` for whoever drives the
 * bare supabase CLI by hand. Nothing in devtools reads what it writes any
 * more (see `db/connection.ts`'s header); it survives as a convenience, not
 * a dependency.
 */
export async function connectRemoteProject(ref?: string): Promise<number> {
  const projectRef = ref ?? process.env.PROJECT_REF;
  if (!projectRef) {
    process.stderr.write(
      "devtools db connect: no project ref given, and PROJECT_REF is not set. " +
        "Pass one, or add PROJECT_REF to your .env file.\n",
    );
    return 1;
  }
  return supabase("link", "--project-ref", projectRef);
}

/** The `seed buckets` shape this connection implies — `--db-url` does not
 * exist for that subcommand, so it is the one data command still keyed on
 * local-vs-hosted rather than on the URL itself. */
function bucketsShape(
  connection: DbConnection,
): Parameters<typeof seedBuckets>[0] {
  return isLocalConnection(connection)
    ? { kind: "local" }
    : { kind: "remote", projectRef: connection.projectRef };
}

async function pushMigrations(connection: DbConnection): Promise<number> {
  // The bare push (shared with CI's `deploy migrate`) then the type
  // regeneration the contributor path layers on top — see `dbPush`'s header
  // for why the two are split.
  const code = await dbPush(connection.dbUrl);
  if (code !== 0) return code;
  return generateTypes(connection.dbUrl);
}

/**
 * ⚠️ SAFETY-CRITICAL: drops and re-migrates `connection.dbUrl`. The caller
 * (`cli.ts`'s `runStack`) has already confirmed the session target —
 * including the hard production gate — before this ever runs.
 *
 * A non-development target gets `--no-seed` on the reset itself, followed by
 * an explicit `runSeedProduction` — the same two steps `db seed production`
 * runs on its own (see `seed-production.ts`) — rather than letting the bare
 * `supabase db reset` apply whatever `config.toml`'s `[db.seed]` happens to
 * list. That is deliberately belt-and-suspenders: `[db.seed]` today lists
 * only `supabase/seed/production`, so the bare reset would already do the
 * right thing, but that is a property of the CURRENT config, not of this
 * function. An older checkout, or a config edited to add
 * `supabase/seed/development` back for some local-only reason, must still be
 * structurally unable to run development's password-login seeds against a
 * hosted, non-dev database — the one seed directory that must never reach
 * staging or production, named in that directory's own header. Development
 * resets are untouched: they keep applying whatever `[db.seed]` lists, same
 * as always.
 *
 * Meetings and workshops are NOT among the tables `supabase/seed/*.sql`
 * populates -- they come from `@devdogsuga/events` via
 * `reconcileFromConfig`, an authenticated platform route rather than a
 * devtools-side function this CLI can call directly (it needs the app's
 * Drizzle client, relations and Sentry wiring, none of which belong in this
 * package). On any DEVELOPMENT reset -- local Docker or the shared remote dev
 * project alike -- this calls that route itself, over the same origin `cron
 * run` would use, once the reset and rebuild finish -- see
 * `reconcileConfigAfterReset` for what happens when nothing is listening yet.
 */
async function reset(connection: DbConnection): Promise<{
  code: number;
  lines: string[];
}> {
  const isDev = connection.tier === "development";
  const code = await supabase(
    "db",
    "reset",
    "--db-url",
    connection.dbUrl,
    ...(isDev ? [] : ["--no-seed"]),
  );
  if (code !== 0) return { code, lines: [] };
  const types = await generateTypes(connection.dbUrl);
  if (types !== 0) return { code: types, lines: [] };
  const bucketsCode = await seedBuckets(bucketsShape(connection));
  if (bucketsCode !== 0) return { code: bucketsCode, lines: [] };

  if (!isDev) {
    const seedCode = await runSeedProduction(connection.dbUrl);
    if (seedCode !== 0) return { code: seedCode, lines: [] };
    return { code: 0, lines: [] };
  }

  return {
    code: 0,
    // Both development databases — local Docker and the shared remote dev
    // project (`--tier development:remote`) — rather than gated on
    // `isLocalConnection`. The platform dev server this hits is always local
    // (`resolveBaseUrl("platform", "development", …)` inside
    // `reconcileConfigAfterReset`); what varies with `devDatabase` is only
    // which Postgres that local server happens to be pointed at, and a
    // remote-dev reset leaves meetings and workshops just as unseeded as a
    // local one.
    lines: await reconcileConfigAfterReset(),
  };
}

/** Injectable so a test can fake "server up" / "server down" and inspect the
 * request `reconcileConfigAfterReset` sends, without a real dev server or a
 * `vi.stubGlobal` on `fetch`. Defaults to the real network. */
export interface ReconcileConfigDeps {
  reachable: typeof originReachable;
  fetch: typeof globalThis.fetch;
}

/**
 * Best-effort trigger for `GET /cron/config-reconcile` against the local
 * platform dev server, so `db reset` leaves meetings and workshops seeded
 * whenever that server happens to already be up -- the common case for a
 * repeat reset during development, rather than a first clone. No
 * `CRON_SECRET` is sent because the route itself skips auth outside a
 * deployed `DEPLOY_ENV` (see that route's header); this is exactly the
 * unauthenticated local request `cron run` would send.
 *
 * When nothing answers yet -- most likely a first-time reset, before anyone
 * has run `pnpm --filter platform dev` -- this reports that instead of
 * silently leaving the tables empty, and names the manual step: start the
 * server, then either re-run this reset or fire the shared fifteen-minute
 * cron slot directly with `pnpm devtools cron run`.
 */
export async function reconcileConfigAfterReset(
  deps: ReconcileConfigDeps = {
    reachable: originReachable,
    fetch: globalThis.fetch,
  },
): Promise<string[]> {
  const { reachable, fetch: fetchImpl } = deps;
  const baseUrl = resolveBaseUrl("platform", "development", undefined, {});
  const manualStep =
    "Start the platform app (`pnpm --filter platform dev`) and either " +
    "re-run `pnpm devtools db reset` or run `pnpm devtools cron run --app " +
    "platform --cron '*/15 * * * *' --yes`.";

  if (!(await reachable(baseUrl))) {
    return [
      `Meetings and workshops are not seeded yet -- nothing is listening at ${baseUrl} ` +
        `to reconcile @devdogsuga/events into them. ${manualStep}`,
    ];
  }

  const url = new URL("/cron/config-reconcile", baseUrl).toString();
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (err) {
    return [
      `Config reconcile request to ${url} failed: ` +
        `${err instanceof Error ? err.message : String(err)}. ${manualStep}`,
    ];
  }

  if (!response.ok) {
    return [
      `Config reconcile answered HTTP ${response.status} at ${url}. ${manualStep}`,
    ];
  }

  const body = (await response.json()) as
    { success: true; counts: unknown } | { success: false; reason: string };
  if (!body.success) {
    return [
      `Config reconcile ran but was aborted (${body.reason}) -- meetings and ` +
        "workshops are still empty. Check the platform dev server's console.",
    ];
  }

  return ["Meetings and workshops reconciled from @devdogsuga/events."];
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
  if (code !== 0 && !wroteEnvFile) return [];
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
 * What `status` says for a local session, now that it can answer for itself.
 *
 * `environment.ts` already reads the two facts that question is really
 * asking about, so this reports them and names the next step. When the
 * stack's containers are up but this checkout's own `.env.generated` is
 * missing — most often a stack another workspace started, sharing this
 * repo's `project_id` — this also attempts the same regeneration
 * `enterSessionEnvironment` (`env-entry.ts`) runs before every command, so
 * `db status` reports the file's ACTUAL state after trying to fix it,
 * rather than a stale "the stack is up" that leaves the absence a mystery.
 */
async function localStatus(): Promise<{ code: number; lines: string[] }> {
  const env = probeEnvironment();
  const lines = [describeEnvironment(env)];

  if (env.docker === "no") {
    lines.push(
      "Start Docker, then `pnpm devtools db start` to bring the stack up.",
    );
    return { code: 0, lines };
  }

  if (env.stack === "no") {
    lines.push("Nothing is running. `pnpm devtools db start` starts it.");
    return { code: 0, lines };
  }

  if (env.stack === "unknown") {
    lines.push(
      "Could not read Docker. `supabase status` asks the stack directly.",
    );
    return { code: 0, lines };
  }

  // env.stack === "yes"
  const repoRoot = findRepoRoot();
  if (existsSync(join(repoRoot, ".env.generated"))) {
    lines.push("The stack is up. `supabase status` prints its URLs and keys.");
    return { code: 0, lines };
  }

  const envLoad = await loadEnvLoad();
  const generated = await ensureGeneratedEnvFile(
    "development",
    undefined,
    realEnsureGeneratedEnvDeps(envLoad.probeLocalStack),
  );
  if (generated.outcome === "wrote") {
    lines.push(
      generated.line.replace(/^devtools: /, ""),
      "The stack is up. `supabase status` prints its URLs and keys.",
    );
  } else if (generated.outcome === "foreign") {
    lines.push(generated.line.replace(/^devtools: /, ""));
  } else if (generated.outcome === "unreachable") {
    lines.push(
      "The stack's containers are up but .env.generated could not be " +
        "regenerated — run `supabase status -o env` yourself to see why.",
    );
  } else {
    // "skipped": Docker's container list said the stack is up, but nothing
    // answered the port probe — a race right after `db start`/`db restart`,
    // most likely. Nothing to regenerate from yet.
    lines.push(
      "Docker reports the stack's containers running, but nothing is " +
        "answering on 127.0.0.1:54321 yet — try again in a moment.",
    );
  }
  return { code: 0, lines };
}

/**
 * Runs a stack command, returning its exit code and anything to report.
 *
 * `connection` is present exactly when the command writes the database
 * (`migrate`, `reset`) — the caller (`cli.ts`'s `runStack`) resolves it,
 * because resolving means possibly refusing with a printed reason, and the
 * lifecycle commands must keep working with no resolvable database at all
 * (that is what `db start` is FOR). `status` receives whatever resolved,
 * or `null`, and degrades to machine facts.
 */
export async function runStackCommand(
  command: StackCommand,
  connection: DbConnection | null,
): Promise<{ code: number; lines: string[] }> {
  if (command === "restart") return restartLocal();

  if (command === "stop") {
    const code = await stopLocalStack();
    return { code, lines: await afterLocalStackChange(code) };
  }

  if (command === "start") {
    const { code, wroteEnvFile, hint } = await startLocalStack();
    const lines = await afterLocalStackChange(code, wroteEnvFile);
    return { code, lines: hint === undefined ? lines : [hint, ...lines] };
  }

  if (command === "status") {
    if (connection === null || isLocalConnection(connection)) {
      return localStatus();
    }
    return {
      code: 0,
      lines: [
        `This session targets ${describeDbTarget(connection)}` +
          (connection.projectRef
            ? ` (project ${connection.projectRef}).`
            : ".") +
          " Check the Supabase dashboard for its health.",
      ],
    };
  }

  if (connection === null) {
    return {
      code: 1,
      lines: [`No database connection was resolved for \`${command}\`.`],
    };
  }

  if (command === "migrate") {
    return { code: await pushMigrations(connection), lines: [] };
  }

  return reset(connection);
}
