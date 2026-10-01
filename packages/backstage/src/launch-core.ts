/**
 * What `backstage` does BEFORE `cli.ts` (and so every command it dispatches)
 * is imported: settle the session's tier, enter it, hand off. `launch.ts` is
 * the entry point the `bin/backstage.mjs` bootstrap runs; the deprecated
 * `devtools-ci` aliases call `launchWith` directly.
 *
 * ## It starts anywhere
 *
 * `pnpm dlx @devdogsuga/backstage` works from any directory, a DevDogsUGA
 * checkout or not. Nothing here needs one until a command does: help, version,
 * completions and anything run with `--no-env` never look for a repository,
 * and never import the optional-peer `@devdogsuga/*` libraries, which are only
 * installed next to a checkout. A command that reads a checkout (`env`,
 * `deploy <app>`, `planner`…) says "run this from inside a DevDogsUGA clone"
 * and exits 1, instead of a stack trace.
 *
 * ## The session's tier
 *
 * Every command here always needs production secrets, but they name their
 * own targets: `env` takes `--target`, `planner` works on the production
 * database. So unlike devtools, nothing is ever asked at launch:
 *
 *   * `--tier <t>` (anywhere in argv, stripped here), else `DEPLOY_ENV`, names
 *     the session's tier and so the env file loaded (`.env.<tier>`);
 *   * with neither, the session is plain `development` and `.env` is loaded,
 *     which is where `BWS_ACCESS_TOKEN` lives;
 *   * the `deploy` group refuses to run without one of the two. Applying
 *     migrations to whatever `DB_URL` the development `.env` happens to hold is
 *     not a default anybody wants.
 *
 * ## `--no-env`
 *
 * Skips tier resolution and env-file loading: the caller's environment is the
 * environment. For `deploy write-env`, which CREATES the file tier resolution
 * would otherwise insist on reading, and for the CI steps that hold one narrow
 * credential in the job's own `env:` block (`preflight`, `plan`, `migrate`,
 * `smoke`, `reconcile`, `planner status`). It replaces the `devtools-ci-bare`
 * bin.
 *
 * ## Staging and production ask first
 *
 * A command that is not read-only asks once before it runs against a hosted
 * tier, `--yes` answers, and with no terminal (or `CI=true`) it refuses
 * without `--yes` (`@devdogsuga/cli-core/safety-gate`).
 */
import { helpPath } from "@devdogsuga/cli-core/help";
import { setCliName, type CliName } from "@devdogsuga/cli-core/cli-name";
import { nonEmpty } from "@devdogsuga/cli-core/db/connection";
import {
  isDryRun,
  resolveDryRun,
  setDryRun,
} from "@devdogsuga/cli-core/dry-run";
import { setMenuEnvHook } from "@devdogsuga/cli-core/env-entry";
import { installFailureLog } from "@devdogsuga/cli-core/failure-log";
import { bareGroupStartPath } from "@devdogsuga/cli-core/menu";
import {
  hasYes,
  isNonInteractive,
  setNoEnv,
  stripNoEnvFlag,
  stripTierFlag,
} from "@devdogsuga/cli-core/mode";
import { ignoreClosedPipes } from "@devdogsuga/cli-core/pipes";
import { loadEnvLoad, loadEnvSession } from "@devdogsuga/cli-core/repo/peers";
import {
  discoverRepoRoot,
  RepoNotFoundError,
} from "@devdogsuga/cli-core/repo/root";
import {
  gateHostedTier,
  GATE_PASSED_ENV,
} from "@devdogsuga/cli-core/safety-gate";
import {
  captureDevtoolsError,
  initDevtoolsTelemetry,
  lastSentryEventId,
} from "@devdogsuga/cli-core/telemetry";
import { errorMessage } from "@devdogsuga/cli-core/ui";
import { catalog } from "./catalog.js";

export interface LaunchOptions {
  /**
   * Runs the command: `cli.ts`'s `main` for the `backstage` bin, or the
   * deprecated `devtools-ci` aliases' own, which keeps the steps this CLI
   * dropped. Injected rather than imported here so the aliases (bundled into
   * devtools) do not pull the whole command tree, Bitwarden included, in with
   * the launcher.
   */
  dispatch: (argv: string[]) => Promise<void>;
  /** Skip the hosted-tier question. The aliases did not have one. Default true. */
  gate?: boolean;
  /** Prefix for what this prints on stderr. Default `backstage`. */
  label?: string;
  /**
   * Which package's version and name Sentry events and the gate's messages
   * carry. The aliases run inside devtools' bundle, so they say `devtools`.
   */
  cli?: CliName;
  /** Do not insist that a `deploy` command name its tier. The aliases never did. */
  lenientTier?: boolean;
}

/** The tier words a `--tier` or `DEPLOY_ENV` may carry. */
const SESSION_TIERS = [
  "development",
  "development:local",
  "development:remote",
  "staging",
  "production",
] as const;

interface Session {
  /** What `DEPLOY_ENV` is set to and the env file is chosen by. */
  tier: "development" | "staging" | "production";
  devDatabase?: "local" | "remote";
  /** Whether the caller named it (`--tier`, `DEPLOY_ENV`) rather than the default. */
  named: boolean;
}

type Resolved = { ok: true; session: Session } | { ok: false; reason: string };

/** `--tier`, else `DEPLOY_ENV`, else plain development. Exported for the tests. */
export function resolveSession(
  explicit: string | undefined,
  deployEnv: string | undefined = process.env.DEPLOY_ENV,
): Resolved {
  const selector = explicit ?? nonEmpty(deployEnv);
  if (selector === undefined) {
    return { ok: true, session: { tier: "development", named: false } };
  }
  if (!(SESSION_TIERS as readonly string[]).includes(selector)) {
    return {
      ok: false,
      reason: `unknown tier "${selector}". Expected: ${SESSION_TIERS.join(", ")}.`,
    };
  }
  const [tier, qualifier] = selector.split(":") as [
    Session["tier"],
    Session["devDatabase"],
  ];
  return {
    ok: true,
    session:
      qualifier === undefined
        ? { tier, named: true }
        : { tier, devDatabase: qualifier, named: true },
  };
}

function fail(label: string, message: string): never {
  process.stderr.write(`${label}: ${message}\n`);
  process.exit(1);
}

/**
 * Loads the session's env files onto `process.env`, or just names the tier
 * under `--no-env`. Exits on a refusal: there is no command dispatched yet for
 * a caller to fall back to.
 */
async function enterSession(
  session: Session,
  noEnv: boolean,
  label: string,
): Promise<void> {
  if (noEnv) {
    // The caller's environment is the environment: name the session, load
    // nothing, and do not even look for a checkout.
    process.env.DEPLOY_ENV = session.tier;
    if (session.devDatabase !== undefined) {
      process.env.DEV_DB = session.devDatabase;
    }
    return;
  }

  if (discoverRepoRoot() === null) {
    fail(label, new RepoNotFoundError().message);
  }

  const envLoad = await loadEnvLoad();
  const envSession = await loadEnvSession();

  // Records which keys THIS shell actually exported before anything touched
  // `process.env`, so a shell variable can beat a file without a value loaded
  // from a file beating it on a nested launch. See `SHELL_KEYS_ENV`
  // (`@devdogsuga/env/load`). Guarded on absence for the nested case.
  process.env[envLoad.SHELL_KEYS_ENV] ??= Object.keys(process.env).join(",");

  try {
    const entered = await envSession.enterEnvironment(session.tier, {
      override: false,
      devDatabase: session.devDatabase,
    });
    for (const warning of entered.warnings) {
      process.stderr.write(`${label}: ${warning}\n`);
    }
    // Mandatory, not chattiness: which environment a command is about to touch
    // must never be a guess.
    process.stderr.write(
      `${label}: loaded ${entered.files.length > 0 ? entered.files.join(", ") : "no env files"} (${session.tier})\n`,
    );
  } catch (err) {
    if (!(err instanceof envLoad.MissingEnvFileError)) throw err;
    if (session.tier !== "development") {
      // An explicitly named staging/production tier with no env file is not a
      // first run: it is a real problem, and `env pull` is the fix the
      // message names.
      fail(label, err.message);
    }
    // A fresh clone has no `.env`; the command may not need it at all.
    process.stderr.write(`${label}: ${err.message}\n`);
  }
}

/**
 * Runs `proceed` only if the hosted-tier gate lets the command through. A
 * command the gate stops exits non-zero and returns `blocked`.
 */
async function gated<T>(
  session: Session,
  commandArgv: readonly string[],
  proceed: () => Promise<T>,
  blocked: T,
  enabled: boolean,
): Promise<T> {
  // A dry run spawns and writes nothing, and a read-only command changes
  // nothing: there is nothing to confirm in either.
  if (
    !enabled ||
    isDryRun() ||
    catalog.findCommand(helpPath(commandArgv))?.dryRun === "read-only"
  ) {
    return proceed();
  }
  const outcome = await gateHostedTier({
    tier: session.tier,
    projectRef: nonEmpty(process.env.PROJECT_REF),
    argv: commandArgv,
    yes: hasYes(commandArgv),
    nonInteractive: isNonInteractive(),
  });
  if (!outcome.proceed) {
    process.exitCode = 1;
    return blocked;
  }
  // A backstage run started by this one inherits the answer.
  process.env[GATE_PASSED_ENV] = session.tier;
  return proceed();
}

/**
 * The refusal for a `deploy` command run with no tier named, if it applies.
 * Under `--no-env` the caller supplied the environment, credentials and all,
 * so there is no env file for the tier to choose and nothing to default.
 */
function missingTier(
  argv: readonly string[],
  session: Session,
  noEnv: boolean,
): string | null {
  if (argv[0] !== "deploy" || session.named || noEnv) return null;
  return (
    "no tier named. A deploy command must be told which environment it is " +
    "for: pass --tier <staging|production> or set DEPLOY_ENV."
  );
}

/**
 * Resolves the session's tier, enters it, and hands off to `options.dispatch`.
 */
export async function launchWith(
  argv: readonly string[],
  options: LaunchOptions,
): Promise<void> {
  setCliName(options.cli ?? "backstage");
  const label = options.label ?? "backstage";
  const gate = options.gate ?? true;

  const { noEnv, rest: withoutNoEnv } = stripNoEnvFlag(argv);
  const { explicit, rest: withoutTier } = stripTierFlag(withoutNoEnv);
  const { dryRun, rest } = resolveDryRun(withoutTier);
  setNoEnv(noEnv);
  setDryRun(dryRun);
  installFailureLog({ argv, eventId: lastSentryEventId });

  // Here rather than only in `cli.ts`'s `main()`, so a failure while entering
  // the tier is reported too. `main()`'s own call is then a no-op
  // (`initDevtoolsTelemetry` is idempotent) and this tag stands.
  ignoreClosedPipes();
  initDevtoolsTelemetry(rest.slice(0, 2).join(" ") || "menu");

  const dispatch = async (args: string[]): Promise<void> => {
    try {
      await options.dispatch(args);
    } catch (err) {
      process.stderr.write(`${label}: ${errorMessage(err)}\n`);
      // Report BEFORE exiting — see `captureDevtoolsError`'s header.
      await captureDevtoolsError(err);
      process.exit(1);
    }
  };

  // Help, the version and completions read no env and need no checkout. Asking
  // which environment first would refuse them on a machine that has never
  // pulled one.
  if (
    rest.includes("--help") ||
    rest.includes("-h") ||
    rest[0] === "version" ||
    rest[0] === "completions"
  ) {
    await dispatch(rest);
    return;
  }

  // A name this CLI does not know (a retired command, a typo) needs no
  // environment to be told so, and asking for a checkout first would hide the
  // answer.
  const name = helpPath(rest)[0];
  if (name !== undefined && catalog.findCommand([name]) === null) {
    await dispatch(rest);
    return;
  }

  const resolved = resolveSession(explicit);
  if (!resolved.ok) fail(label, resolved.reason);
  const { session } = resolved;

  // A menu invocation (a bare `backstage`, or a bare group resumed at a
  // terminal) enters nothing yet: the env files are loaded right before the
  // ONE command the reader chose, so they are current as of that moment. See
  // `menu.ts`'s `runMenu`.
  const isMenuInvocation =
    rest.length === 0 ||
    (process.stdin.isTTY === true &&
      bareGroupStartPath(catalog, rest) !== null);

  if (isMenuInvocation) {
    setMenuEnvHook(async (commandArgv, dispatchCommand) => {
      // The chosen command may carry its own `--tier` (the deploy prompt).
      const chosen = resolveSession(stripTierFlag(commandArgv).explicit);
      if (!chosen.ok) {
        process.stderr.write(`${label}: ${chosen.reason}\n`);
        process.exitCode = 1;
        return null;
      }
      const refusal = options.lenientTier
        ? null
        : missingTier(commandArgv, chosen.session, noEnv);
      if (refusal) {
        process.stderr.write(`${label}: ${refusal}\n`);
        process.exitCode = 1;
        return null;
      }
      await enterSession(chosen.session, noEnv, label);
      return gated(chosen.session, commandArgv, dispatchCommand, null, gate);
    });
    await dispatch(rest);
    return;
  }

  const refusal = options.lenientTier
    ? null
    : missingTier(rest, session, noEnv);
  if (refusal) fail(label, refusal);

  await enterSession(session, noEnv, label);
  await gated(session, rest, () => dispatch(rest), undefined, gate);
}
