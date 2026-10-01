/**
 * Entering a resolved deploy tier's environment — the part of `launch.ts`
 * that actually loads `.env.<tier>` (and its `DEV_DB` overlay) onto
 * `process.env`, with the two recoverable failures `enterEnvironment` can
 * throw handled the same way everywhere it is called from.
 *
 * ## Why this is its own module
 *
 * A typed command line enters its tier at launch, before `cli.ts` is even
 * imported — see `launch.ts`'s header. A menu invocation cannot: the whole
 * point of the wizard is to show a contributor what is possible before they
 * have chosen anything, and loading env files (and possibly offering to
 * start the local stack) before that first question is answered means
 * whatever changed in another terminal while they were deciding — the stack
 * coming up, `.env.generated` being rewritten — is missed. So a menu
 * invocation defers this exact block until `menu.ts`'s `runMenu` is about to
 * dispatch the ONE command the reader chose, right before it runs.
 *
 * `enterSessionEnvironment` is the block both callers share, generic over
 * what "dispatch the command" means to each: `launch.ts` imports `cli.ts`
 * fresh and calls its `main()`, `runMenu` already holds the dispatcher
 * `cli.ts` injected into it. `commandArgv` is the argv the caller is about to
 * dispatch — used for the two `LocalStackOfflineError` exemptions (a `db`
 * lifecycle command, and an empty argv) exactly as `launch.ts` used `rest`
 * for them before this was extracted.
 *
 * ## The hook `runMenu` calls
 *
 * `setMenuEnvHook`/`takeMenuEnvHook` are a module-level slot shared by
 * `launch.ts` and `menu.ts`: `cli.ts` calls `runMenu` with a fixed signature
 * that has no room for a per-invocation callback. `launch.ts` sets the hook
 * for a menu invocation before handing off to `cli.ts`; `runMenu` takes it
 * (reading clears it) right before its own dispatch, so a nested launcher
 * never inherits a stale one.
 *
 * ## Regenerating `.env.generated` before entry
 *
 * Before either caller's `enterEnvironment` call, this also gives a running
 * local stack a chance to fix its own absence: `deps.ensureGeneratedEnv`
 * (`db/generated-env.ts`'s `ensureGeneratedEnvFile`, wired by
 * `realEnvEntryDeps`) writes `.env.generated` from `supabase status -o env`
 * when the port is listening but the file is missing — the common shape of
 * a local stack another workspace started, sharing this repo's
 * `project_id` — so the entry below usually just succeeds instead of
 * throwing `LocalStackOfflineError` or warning about a file nobody wrote.
 * A `"foreign"` result (the stack on the port belongs to a DIFFERENT
 * project) prints its own hint and then falls through to the unchanged
 * error handling below, since the file is still missing either way.
 */
import { confirm } from "@clack/prompts";
import type { DeployEnvironment } from "@devdogsuga/env";
import type { DevDatabase } from "@devdogsuga/env/load";
import type * as EnvLoadModule from "@devdogsuga/env/load";
import type * as EnvSessionModule from "@devdogsuga/env/session";
import {
  ensureGeneratedEnvFile,
  realEnsureGeneratedEnvDeps,
  type EnsureGeneratedEnvResult,
} from "./db/generated-env.js";
import { unwrap } from "./ui.js";

export interface EnvEntryDeps {
  envLoad: typeof EnvLoadModule;
  envSession: typeof EnvSessionModule;
  /**
   * Regenerates `.env.generated` from a running local stack when this
   * checkout's own copy is missing, right before the session's env files
   * load — see this module's header and `db/generated-env.ts`. Required
   * (not defaulted here) so every caller is explicit about it: `launch.ts`
   * uses `realEnvEntryDeps` for the real wiring, tests inject a stub that
   * never touches a real filesystem, Docker daemon, or the Supabase CLI.
   */
  ensureGeneratedEnv: (
    tier: DeployEnvironment,
    devDatabase: DevDatabase | undefined,
  ) => Promise<EnsureGeneratedEnvResult>;
  /**
   * Starts the local Supabase stack, for the offer made when the session's
   * local database is down. Injected rather than imported: the stack
   * lifecycle is a command of the CLI built on this core, not part of it.
   */
  startStack: () => Promise<{ code: number; lines: string[] }>;
}

/**
 * The production wiring for `EnvEntryDeps`, shared by both call sites in
 * `launch.ts`.
 */
export function realEnvEntryDeps(
  envLoad: typeof EnvLoadModule,
  envSession: typeof EnvSessionModule,
  startStack: EnvEntryDeps["startStack"],
): EnvEntryDeps {
  return {
    envLoad,
    envSession,
    startStack,
    ensureGeneratedEnv: (tier, devDatabase) =>
      ensureGeneratedEnvFile(
        tier,
        devDatabase,
        realEnsureGeneratedEnvDeps(envLoad.probeLocalStack),
      ),
  };
}

/**
 * Enters `tier` (and `devDatabase`'s overlay) for the current process,
 * handling `LocalStackOfflineError` (the TTY offer to start the local stack,
 * the `db`-exemption degraded-entry fallback) and `MissingEnvFileError` (the
 * clean-clone tolerance for `development`, fatal otherwise) exactly as
 * `launch.ts` always has. `dispatchCommand` is called exactly once, in every
 * non-fatal branch — including immediately, in place of any further entry
 * work, when a declined-then-accepted stack start already ran it — so its
 * return value is always this function's own return value.
 */
export async function enterSessionEnvironment<T>(
  tier: DeployEnvironment,
  devDatabase: DevDatabase | undefined,
  commandArgv: readonly string[],
  deps: EnvEntryDeps,
  dispatchCommand: () => Promise<T>,
): Promise<T> {
  const { envLoad, envSession } = deps;

  const generated = await deps.ensureGeneratedEnv(tier, devDatabase);
  if (generated.outcome === "wrote" || generated.outcome === "foreign") {
    process.stderr.write(`${generated.line}\n`);
  }

  // Mandatory, not chattiness: which database a command is about to touch
  // must never be a guess. Names the QUALIFIED session (`development:local`)
  // when one was resolved. See `session.ts`'s and `load.ts`'s own headers.
  const reportEntered = (files: string[], label: string): void => {
    process.stderr.write(
      `devtools: loaded ${files.length > 0 ? files.join(", ") : "no env files"} (${label})\n`,
    );
  };
  const sessionLabel =
    devDatabase === undefined ? tier : `${tier}:${devDatabase}`;

  try {
    // `override: false` — see `launch.ts`'s former header comment on this
    // same call, reproduced here since this IS that call now.
    const entered = await envSession.enterEnvironment(tier, {
      override: false,
      devDatabase,
    });
    for (const warning of entered.warnings) {
      process.stderr.write(`devtools: ${warning}\n`);
    }
    reportEntered(entered.files, sessionLabel);
  } catch (err) {
    if (err instanceof envLoad.LocalStackOfflineError) {
      // The session explicitly means the local database and the stack is not
      // reachable.
      process.stderr.write(`devtools: ${err.message}\n`);

      // Offer to bring the stack up right here and then carry on with the
      // command about to dispatch. Only on a TTY, and not when the command is
      // ITSELF a stack lifecycle command — `db start`/`stop`/`restart` do
      // this on their own, and `db stop` against an already-down stack must
      // not be interrupted by an offer to start it. An empty `commandArgv`
      // (nothing chosen yet) is likewise left alone.
      const lifecycle =
        commandArgv[0] === "db" &&
        (commandArgv[1] === "start" ||
          commandArgv[1] === "stop" ||
          commandArgv[1] === "restart");
      if (
        process.stdin.isTTY === true &&
        commandArgv.length !== 0 &&
        !lifecycle
      ) {
        const start = unwrap(
          await confirm({
            message: "Start the local Supabase stack now?",
          }),
        );
        if (start) {
          // Keep the session's local qualifier set so the env refresh that
          // `runStackCommand("start")` performs on success re-applies the
          // overlay under it, and the command dispatched next resolves the
          // freshly-started local database.
          if (devDatabase !== undefined) process.env.DEV_DB = devDatabase;
          const { code, lines } = await deps.startStack();
          for (const line of lines) {
            process.stderr.write(`devtools: ${line}\n`);
          }
          if (code === 0) {
            return await dispatchCommand();
          }
          process.stderr.write(
            "devtools: the stack did not start — see the Supabase CLI output " +
              "above.\n",
          );
          process.exit(1);
        }
      }

      // Declined, or nobody to ask. `db` (whose `start` is the fix, and whose
      // data commands re-check the connection themselves) and an empty argv
      // (the road to `db start` — the bare menu, when nothing has deferred
      // this far, or the menu resumed on `db` itself) may continue in a
      // degraded, unqualified entry; anything else stops here, with the
      // error's own troubleshooting, instead of failing later against
      // whatever `.env` happens to name.
      if (commandArgv.length !== 0 && commandArgv[0] !== "db") {
        process.exit(1);
      }
      process.stderr.write(
        "devtools: continuing without the overlay so `db start` can fix this.\n",
      );
      const inherited = process.env.DEV_DB;
      delete process.env.DEV_DB;
      const entered = await envSession.enterEnvironment(tier, {
        override: false,
      });
      if (devDatabase !== undefined) {
        // Children spawned AFTER `db start` succeeds should still inherit
        // the session's answer; the refresh that follows a successful start
        // re-applies the overlay under this same variable.
        process.env.DEV_DB = devDatabase;
      } else if (inherited !== undefined) {
        process.env.DEV_DB = inherited;
      }
      for (const warning of entered.warnings) {
        process.stderr.write(`devtools: ${warning}\n`);
      }
      reportEntered(entered.files, tier);
      return await dispatchCommand();
    }
    if (!(err instanceof envLoad.MissingEnvFileError)) throw err;

    if (tier === "development") {
      // The clean-clone path: a fresh checkout has no `.env` at all, and
      // `pnpm devtools setup` is how one gets created — `MissingEnvFileError`
      // names it. Reporting and continuing here, rather than refusing, is
      // what lets `setup` itself run through this same entry point. See
      // `load.ts`'s `MissingEnvFileError` for the message this prints.
      process.stderr.write(`devtools: ${err.message}\n`);
    } else {
      // An EXPLICITLY selected staging/production tier with no env file is
      // not a first run — it is a real problem, and `env pull` is the fix
      // `MissingEnvFileError`'s own message already names. Fatal.
      process.stderr.write(`devtools: ${err.message}\n`);
      process.exit(1);
    }
  }

  return await dispatchCommand();
}

// ── The menu hook ────────────────────────────────────────────────────────────

/**
 * What `runMenu` calls, right before dispatching the chosen command, in
 * place of entering the environment itself — `commandArgv` is the chosen
 * leaf's argv, `dispatchCommand` is `runMenu`'s own injected dispatcher for
 * it. See this module's header for why a module-level slot rather than a
 * `runMenu` parameter.
 */
export type MenuEnvHook = (
  commandArgv: readonly string[],
  dispatchCommand: () => Promise<string | null>,
) => Promise<string | null>;

let menuEnvHook: MenuEnvHook | undefined;

/** Set by `launch.ts` for a menu invocation; `undefined` for a typed command
 *  (which entered already) and for any test that drives `runMenu` directly
 *  without going through `launch.ts` at all. */
export function setMenuEnvHook(hook: MenuEnvHook | undefined): void {
  menuEnvHook = hook;
}

/** Read by `runMenu`, then cleared — see this module's header on why a
 *  nested launcher must not inherit a stale hook. */
export function takeMenuEnvHook(): MenuEnvHook | undefined {
  const hook = menuEnvHook;
  menuEnvHook = undefined;
  return hook;
}
