/**
 * `pnpm devtools`'s actual entry point, run by the `bin/devtools.mjs`
 * bootstrap BEFORE `cli.ts` — and therefore every command it dispatches — is
 * even imported.
 *
 * ## Why this has to run first
 *
 * A deploy tier used to be resolved deep inside `menu.ts`, after the wizard
 * had already opened, and a typed command's tier lived wherever that command
 * happened to resolve one — `cf preview`, `cron run` and `db --target remote`
 * each asking their own question. That meant `--tier` only worked for the
 * commands that had been taught to parse it, and a contributor who wanted
 * `pnpm devtools db status --target remote --tier staging` piped through a
 * wizard question first anyway.
 *
 * This module settles the tier ONCE, before any command's imports — let alone
 * its code — run, using the shared policy in `@devdogsuga/env/session`. By
 * the time `cli.ts` is imported, `process.env.DEPLOY_ENV` already names the
 * tier, so `cli.ts`, `menu.ts` and every runner underneath them just read
 * `process.env.DEPLOY_ENV`/`DEV_DB` like any other command would under
 * `with-env` — this module IS the replacement for `with-env`'s job.
 *
 * ## Entering the environment: at launch, or deferred to the menu
 *
 * "Settling the tier" and "entering it" (loading `.env.<tier>` and its
 * `DEV_DB` overlay onto `process.env`, via `@devdogsuga/env/session`'s
 * `enterEnvironment`) are two different steps, and a MENU invocation —
 * a bare `pnpm devtools`, or a bare group like `pnpm devtools db` resumed
 * through `bareGroupStartPath` — only gets the first one here. Entering holds
 * the env files hostage to whatever was true at the moment this process
 * started; a contributor who starts the local stack in another terminal
 * while still choosing from the wizard would otherwise have that missed
 * entirely. So for a menu invocation this module resolves the tier, exports
 * `DEPLOY_ENV`/`DEV_DB` directly (skipping `enterEnvironment` itself), and
 * registers `env-entry.ts`'s menu hook instead of entering — `menu.ts`'s
 * `runMenu` calls it right before dispatching the ONE command the reader
 * chose, so the env files loaded are current as of that moment, not this
 * one. A typed command line still enters right here, unchanged: there is no
 * wizard delay to protect it from.
 *
 * ## `--tier`, a global flag
 *
 * `--tier <t>` is accepted at ANY position in argv and stripped here before
 * `cli.ts` ever sees the rest, precisely so it cannot collide with a
 * command's own flag of the same name (`db --target remote --tier staging`,
 * `cron run --tier production`) — those still parse their OWN `--tier` out of
 * the argv `cli.ts` receives, but by then the session's tier decision has
 * already been made, and `resolveTier` (see `tier.ts`) falls back to reading
 * it off `process.env.DEPLOY_ENV` rather than asking again.
 */
import { select } from "@clack/prompts";
import type { DeployEnvironment } from "@devdogsuga/env";
import type { DevDatabase } from "@devdogsuga/env/load";
import type { TierChoice } from "@devdogsuga/env/session";
import { findCommand } from "./commands.js";
import {
  enterSessionEnvironment,
  realEnvEntryDeps,
  setMenuEnvHook,
} from "./env-entry.js";
import { bareGroupStartPath } from "./menu.js";
import { discoverRepoRoot, findRepoRoot, RepoNotFoundError } from "./repo/root.js";
import { loadEnvLoad, loadEnvSession } from "./repo/peers.js";
import { captureDevtoolsError, initDevtoolsTelemetry } from "./telemetry.js";
import { ignoreClosedPipes } from "./pipes.js";
import { errorMessage, unwrap } from "./ui.js";

/**
 * Pulls a global `--tier <t>` out of `argv`, wherever it sits, leaving every
 * other argument untouched and in its original order. Exported for its own
 * unit tests; `launch()` below is the only real caller.
 */
export function stripTierFlag(argv: readonly string[]): {
  explicit: string | undefined;
  rest: string[];
} {
  const rest = [...argv];
  const index = rest.indexOf("--tier");
  if (index === -1) return { explicit: undefined, rest };
  const value = rest[index + 1];
  // A trailing `--tier` with nothing after it removes just the flag; the
  // missing value then reaches `resolveSessionTier` as `explicit: undefined`,
  // which falls through to `DEPLOY_ENV`/the sole tier/the prompt exactly as
  // if `--tier` had never been typed, rather than this function guessing.
  //
  // A following token that is itself a flag is treated the same way, NOT
  // consumed as the value — the guard every other flag-value reader in this
  // CLI keeps (`cli.ts`'s `flagValue`). Without it,
  // `--tier --help` or `--tier -h` would swallow the flag as a bogus tier and
  // refuse with "unknown tier" instead of reaching the help bypass below.
  const missing = value === undefined || value.startsWith("-");
  rest.splice(index, missing ? 1 : 2);
  return { explicit: missing ? undefined : value, rest };
}

/**
 * Whether the command `rest` dispatches to is declared `envFree` in
 * `commands.ts`'s catalog — the leading run of non-flag tokens is the
 * command path (`["github", "rulesets"]` out of `["github", "rulesets",
 * "--apply"]`), the same convention `stripTierFlag` already uses for
 * pulling a flag out of argv wherever it sits.
 *
 * Catalog-driven rather than a second hardcoded name list: `setup` and
 * `completions` below stay their own explicit branch (each skips tier
 * resolution for a DIFFERENT reason worth spelling out at the call site —
 * see the comment above), but a plain "this command touches no env at all"
 * exemption reads once, from the same tree `--help` and the wizard already
 * render, rather than as a name a future GitHub-only command has to
 * remember to add here too.
 */
function isEnvFreeCommand(rest: readonly string[]): boolean {
  const path: string[] = [];
  for (const arg of rest) {
    if (arg.startsWith("-")) break;
    path.push(arg);
  }
  return findCommand(path)?.envFree === true;
}

/** The real interactive picker: a clack `select`, unwrapped so Ctrl-C exits
 * cleanly instead of leaking a cancel symbol into `resolveSessionTier`.
 * Values are session selector words (`"development:local"`, `"staging"`…). */
async function promptTier(
  message: string,
  choices: TierChoice[],
): Promise<string> {
  return unwrap(await select<string>({ message, options: choices }));
}

/**
 * Imports `cli.ts` and runs it, reporting a thrown rejection the same way
 * `cli.ts`'s own top level used to before `main` became an export instead of
 * an auto-running IIFE (see `main`'s own header). Shared by both places
 * `launch()` hands off to it: the `--help`/`-h` bypass below, and the normal
 * post-tier-resolution path.
 */
async function dispatch(argv: string[]): Promise<void> {
  const { main } = await import("./cli.js");
  try {
    await main(argv);
  } catch (err) {
    process.stderr.write(`devtools: ${errorMessage(err)}\n`);
    // Report BEFORE exiting — see `captureDevtoolsError`'s header.
    await captureDevtoolsError(err);
    process.exit(1);
  }
}

/**
 * Resolves the session's deploy tier, enters it (or defers entry to the
 * menu — see this file's header), and hands off to `cli.ts`.
 *
 * Exits the process directly on a refusal from `resolveSessionTier` — there
 * is no command dispatched yet for a caller to fall back to, so there is
 * nothing this function could return that would mean anything.
 */
export async function launch(argv: readonly string[]): Promise<void> {
  const { explicit, rest } = stripTierFlag(argv);

  // Here rather than only in `cli.ts`'s `main()`, so a failure while
  // resolving or entering the tier below is reported too. `main()`'s own
  // call is then a no-op (`initDevtoolsTelemetry` is idempotent) and this
  // tag, computed from the same argv `main()` receives, stands.
  ignoreClosedPipes();
  initDevtoolsTelemetry(rest[0] ?? "menu");

  // Same test `cli.ts`'s own `main()` uses to decide whether a bare command
  // group resumes the wizard instead of dispatching — computed here too so
  // this function can decide, before resolving anything, whether entry gets
  // deferred to `menu.ts`'s hook. A non-TTY caller never resumes the wizard
  // (see `bareGroupStartPath`'s own doc), so `rest.length === 0` is the only
  // menu shape it can hit — mirroring `main()`'s own `process.stdin.isTTY ?
  // bareGroupStartPath(argv) : null`.
  const isMenuInvocation =
    rest.length === 0 ||
    (process.stdin.isTTY === true && bareGroupStartPath(rest) !== null);

  // `--help`/`-h` bypasses tier resolution entirely, BEFORE it can refuse.
  // `cli.ts`'s own `main()` already answers these with no env in play (see
  // its header comment); resolving a tier first anyway meant `pnpm devtools
  // --help` refused outright on a machine with two-or-more tier files
  // present — the ordinary state for anyone who has ever run `env pull` for
  // staging or production — even though the command that would have run
  // needs no database, credential, or `DEPLOY_ENV` at all. `bw --help` is
  // NOT special-cased here the way `cli.ts` special-cases it ahead of its own
  // `--help` check: `main()` still sees `bw` first and hands off to Bitwarden
  // before ever reaching its `--help` branch, so routing straight to `main()`
  // below reproduces that passthrough correctly either way.
  if (rest.includes("--help") || rest.includes("-h")) {
    await dispatch(rest);
    return;
  }

  const envLoad = await loadEnvLoad();
  const envSession = await loadEnvSession();

  // Records, once, which keys THIS shell actually exported before devtools
  // touched anything — the fix for the staleness bug `enterEnvironment`'s own
  // `override: false` comment below describes. `Object.keys(process.env)` at
  // this exact point is still a faithful snapshot of the calling shell: the
  // imports above load code, not env; nothing before this line has mutated
  // `process.env`. See `SHELL_KEYS_ENV` (`@devdogsuga/env/load`) for how
  // `loadEnvironment` narrows "a shell var beats the file" to just this list.
  //
  // Guarded on absence so a NESTED devtools launcher (one `pnpm devtools`
  // command spawning another, e.g. the `db start` offer below re-dispatching
  // through `dispatch()`) keeps the ORIGINAL list instead of recomputing one:
  // by the time a nested launcher's `launch()` runs, `process.env` already
  // holds this session's entered values, not the outer shell's, and
  // recomputing from it would misclassify every one of them as a genuine
  // shell export — the exact bug this marker exists to prevent, one layer in.
  if (process.env[envLoad.SHELL_KEYS_ENV] === undefined) {
    process.env[envLoad.SHELL_KEYS_ENV] = Object.keys(process.env).join(",");
  }

  let tier: DeployEnvironment;
  let devDatabase: DevDatabase | undefined;
  if (rest[0] === "setup" || rest[0] === "completions" || isEnvFreeCommand(rest)) {
    // Two commands run BEFORE there is a tier to resolve, and forcing the
    // mandate on them breaks each in its own way:
    //
    //   * `setup` exists to CREATE a missing env file. A stale
    //     `DEPLOY_ENV=staging` in the shell with no `.env.staging` on disk
    //     would resolve that tier, fail `enterEnvironment` fatally below, and
    //     lock a new contributor out of the one command that fixes their
    //     state — a bootstrap deadlock. It is development-only by nature
    //     (it writes `.env`), so the session tier question has one answer.
    //   * `completions` runs from shell rc files (`eval "$(pnpm devtools
    //     completions bash)"`), always non-TTY, and reads no env at all; the
    //     multi-tier refusal would exit 1 in every new shell on exactly the
    //     machines of the people working on the deploy workflow.
    //
    // A third, open-ended case joins them here via `isEnvFreeCommand`:
    // `github rulesets` and `github settings` (TASK-322, TASK-342) touch no
    // DevDogsUGA env file or database at all — every write either one makes
    // is a `gh api` call resolved from its own `--org`/`--repo` flags — so
    // demanding a `--tier` before either could run was never a real
    // requirement, only every command sharing one dispatch gate. See
    // `isEnvFreeCommand`'s own doc for why this is catalog-driven rather
    // than a third name joining the `rest[0] ===` checks above.
    //
    // Development is still ENTERED below (missing-file tolerated), not
    // skipped: `setup` under the old `with-env` wrapper saw whatever `.env`
    // already existed, and keeping that means it can read current values
    // when offering to rewrite them.
    tier = "development";
  } else if (discoverRepoRoot() === null) {
    // Every command past this point needs a real repo to resolve a tier
    // against (`findRepoRoot()` below would throw `RepoNotFoundError`
    // anyway) — surfaced here as the same clean, expected refusal every
    // other repo-dependent command gives, rather than an uncaught throw
    // with a stack trace pointing at internal module paths.
    process.stderr.write(`devtools: ${new RepoNotFoundError().message}\n`);
    process.exit(1);
  } else {
    // The `.env`-names-a-remote-database lookup (and the port probe that
    // phrases the local hint) are only paid when the resolution could
    // actually land on BARE development — an explicit staging/production or
    // qualified selector, an already-deployed DEPLOY_ENV, or a DEV_DB answer
    // all settle the question without them, and the lookup imports dotenvx.
    const deployEnv = process.env.DEPLOY_ENV ?? "";
    const couldBeBareDevelopment =
      (process.env.DEV_DB ?? "") === "" &&
      (explicit === "development" ||
        (explicit === undefined &&
          (deployEnv === "" || deployEnv === "development")));
    const remoteCandidate = couldBeBareDevelopment
      ? await envSession.developmentRemoteCandidate(findRepoRoot())
      : undefined;
    const localStackOnline =
      typeof remoteCandidate === "string" ? await envLoad.probeLocalStack() : undefined;

    const resolution = await envSession.resolveSessionTier({
      explicit,
      deployEnv: process.env.DEPLOY_ENV,
      devDb: process.env.DEV_DB,
      available: await envSession.availableTiers(findRepoRoot()),
      isTTY: process.stdin.isTTY === true,
      prompt: promptTier,
      promptMessage: "Which environment should this session use?",
      remoteCandidate,
      localStackOnline,
    });

    if (!resolution.ok) {
      process.stderr.write(`devtools: ${resolution.reason}\n`);
      process.exit(1);
    }

    tier = resolution.tier;
    devDatabase = resolution.devDatabase;
  }

  if (isMenuInvocation) {
    // Export the decision, not the files: `DEPLOY_ENV`/`DEV_DB` name the
    // session the same way `enterEnvironment` would set them, but loading
    // `.env.<tier>` itself — and everything `enterSessionEnvironment` does
    // around that, including the offline-stack offer — waits for a command to
    // actually be chosen. See this file's header.
    process.env.DEPLOY_ENV = tier;
    if (devDatabase !== undefined) process.env.DEV_DB = devDatabase;

    setMenuEnvHook((commandArgv, dispatchCommand) =>
      enterSessionEnvironment(
        tier,
        devDatabase,
        commandArgv,
        realEnvEntryDeps(envLoad, envSession),
        dispatchCommand,
      ),
    );
    await dispatch(rest);
    return;
  }

  // Caught here rather than left to `bin/devtools.mjs`'s `child.on("error",
  // …)`, which only ever sees a spawn failure, never a rejection thrown
  // inside this process.
  await enterSessionEnvironment(
    tier,
    devDatabase,
    rest,
    realEnvEntryDeps(envLoad, envSession),
    () => dispatch(rest),
  );
}

// `bin/devtools.mjs` runs this file directly through tsx — `tsx
// --conditions=devdogs-source src/launch.ts <argv…>` — so `process.argv`
// carries this file's own path where a bare `node` invocation would, and the
// real argv starts one slot later.
if (import.meta.url === `file://${process.argv[1]}`) {
  await launch(process.argv.slice(2));
}
