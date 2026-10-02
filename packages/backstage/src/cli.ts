/**
 * `backstage [--tier <t>] [--no-env] [command]`
 *
 * The officer and production CLI. Run it with no arguments and it opens a
 * menu; the subcommands exist for anyone who knows them, and for CI, which
 * cannot answer a prompt.
 *
 * ## One tree, many handlers
 *
 * `catalog.ts` composes the command tree from each domain's `catalog.ts`
 * (inert data). `help.ts` and `menu.ts` in `@devdogsuga/cli-core` render and
 * walk it, and the menu turns a walk into an argv that comes back through
 * `dispatch()` below, the same entry a typed command line takes. There is no
 * second list of commands anywhere, so there is nothing to fall out of step.
 * Each domain's `commands.ts` owns its handlers; this file only maps names to
 * them.
 */
import { intro, log, note, outro } from "@clack/prompts";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import {
  dryRunKind,
  isDryRun,
  wouldRunLine,
} from "@devdogsuga/cli-core/dry-run";
import {
  helpPath,
  renderCommandList,
  renderHelp,
} from "@devdogsuga/cli-core/help";
import {
  beginInvocation,
  recordEnteredTier,
  reproducibleCommand,
} from "@devdogsuga/cli-core/invocation";
import { bareGroupStartPath, runMenu } from "@devdogsuga/cli-core/menu";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import {
  captureDevtoolsError,
  initDevtoolsTelemetry,
} from "@devdogsuga/cli-core/telemetry";
import { errorMessage, explain } from "@devdogsuga/cli-core/ui";
import { ownVersion } from "@devdogsuga/cli-core/version";
import { catalog } from "./catalog.js";
import { handleCompletions } from "./completions/commands.js";
import { runDeployCommand } from "./deploy/commands.js";
import { handleEnv } from "./env/commands.js";
import { handleGithub } from "./github/commands.js";
import { runPlannerCommand } from "./planner/commands.js";

// ── Dispatch ─────────────────────────────────────────────────────────────────

/** Top-level command names to their handlers, each owned by its domain. */
export const HANDLERS: Record<string, CommandHandler> = {
  deploy: async (rest) => {
    await runDeployCommand(rest);
    return process.exitCode ? null : DONE;
  },
  env: handleEnv,
  planner: async (rest) => {
    await runPlannerCommand(rest);
    return process.exitCode ? null : DONE;
  },
  completions: handleCompletions,
  github: handleGithub,
  // The next three load on use: they pull in the brand package's fonts and
  // artwork, or the newsletter's React, which no other command needs.
  graphics: async (rest) =>
    (await import("./graphics/commands.js")).handleGraphics(rest),
  qr: async (rest) => (await import("./qr/commands.js")).handleQr(rest),
  newsletter: async (rest) =>
    (await import("./newsletter/commands.js")).handleNewsletter(rest),
  creds: async (rest) =>
    (await import("./creds/commands.js")).handleCreds(rest),
};

/**
 * Names that were commands of the contributor CLI, refused with where they
 * went rather than falling into "Unknown command": they are in scripts,
 * workflows and shell histories. (The `deploy` steps that went away are
 * handled by `deploy/commands.ts`.)
 */
const RETIRED: Record<string, { message: string; hints: string[] }> = {
  bw: {
    message: "`bw` is gone: `env` signs in to Bitwarden itself.",
    hints: ["backstage env <pull|push|audit> --target <target>"],
  },
};

/**
 * Routes an argv to a command, and reports what to print when it returns.
 *
 * The menu calls THIS rather than the command functions, so a menu walk and a
 * typed command line take the identical path.
 *
 * Returns the `outro()` line, or `null` where the failure has already been
 * explained and a cheerful "Done." would contradict it.
 */
async function dispatch(argv: string[]): Promise<string | null> {
  const [first, ...rest] = argv;
  if (!first) return DONE;

  const handler = HANDLERS[first];
  if (handler) {
    // A command that has not said how it treats `--dry-run` may spawn or
    // write, so it is stopped here and its command line printed instead.
    if (isDryRun() && dryRunKind(catalog, helpPath(argv)) === undefined) {
      process.stderr.write(`${wouldRunLine(argv)}\n`);
      return DONE;
    }
    return handler(rest);
  }

  log.error(`Unknown command: ${first}`);
  // The top level only. The command is unknown, so there is no level below
  // it to describe, and reprinting the whole tree is what made the old help
  // unreadable in the first place.
  log.message(renderHelp(catalog));
  process.exitCode = 1;
  return null;
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * Runs the CLI against an already-resolved argv.
 *
 * Exported rather than run at import, so `launch.ts` can resolve the deploy
 * tier and enter its environment BEFORE this module's imports (and the
 * commands they pull in) ever see `process.env`.
 */
export async function main(argv: string[]): Promise<void> {
  // Bootstrapped here, after `argv` is parsed off `process.argv` and before any
  // dispatch below, so the `command` tag on whatever this run reports is the
  // same argv every branch is about to act on.
  initDevtoolsTelemetry(argv.slice(0, 2).join(" ") || "menu");

  // A retired name, refused with its replacement before anything else runs.
  const retired = RETIRED[argv[0] ?? ""];
  if (retired) {
    explain(retired.message, "", retired.hints);
    process.exitCode = 1;
    return;
  }

  // `--help --json` is the supported command list, for tools: every path the
  // CLI accepts, deprecated ones marked. Plain stdout, no banner. Only with no
  // command named, so `env audit --json --help` still answers about `env audit`.
  if (
    (argv.includes("--help") || argv.includes("-h")) &&
    argv.includes("--json") &&
    helpPath(argv).length === 0
  ) {
    process.stdout.write(`${renderCommandList(catalog, ownVersion())}\n`);
    return;
  }

  // `helpPath` so that `env pull --help` answers about `env pull` rather than
  // reprinting the top level, which is the whole point of the split.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(renderHelp(catalog, helpPath(argv)));
    return;
  }

  // `completions` is meant for `eval "$(pnpm backstage completions --shell
  // bash)"`, which executes every line of stdout as a shell command. Dispatched
  // before `intro()` so no banner lands on that stdout.
  if (argv[0] === "completions") {
    await handleCompletions(argv.slice(1));
    return;
  }

  // Clean stdout: mostly useful for confirming which build actually ran.
  if (argv[0] === "version") {
    process.stdout.write(`${ownVersion()}\n`);
    return;
  }

  // A deploy command's stdout is a channel something downstream may parse, so
  // no banner and no clack: everything in this group reports through `say()`
  // (stderr). See `deploy/report.ts`.
  if (argv[0] === "deploy") {
    await runDeployCommand(argv.slice(1));
    return;
  }

  // A bare command group at a terminal resumes the menu at that node, so
  // `backstage env` opens env's subcommand screen instead of printing "which
  // of …?" and exiting 1. Non-interactive callers get null and keep the
  // dispatcher's error + exit 1.
  const startPath = process.stdin.isTTY
    ? bareGroupStartPath(catalog, argv)
    : null;

  // No banner without a terminal: a log, a pipe or a CI step wants plain
  // lines (see `@devdogsuga/cli-core/mode`).
  const banners = !isNonInteractive();
  if (banners) intro("DevDogs backstage");

  // The menu builds an argv and hands it back to `dispatch`. See `menu.ts`.
  // `runMenu` begins its own recording from the built argv; a typed command
  // begins here, non-interactive until a runner resolves a flag from a prompt.
  let closing: string | null;
  if (argv.length === 0) {
    closing = await runMenu(catalog, dispatch);
  } else if (startPath) {
    closing = await runMenu(catalog, dispatch, undefined, { startPath });
  } else {
    beginInvocation(argv, false);
    // `launch.ts` already resolved and entered the session's tier, so
    // `process.env.DEPLOY_ENV` names it here for every path.
    recordEnteredTier(process.env.DEPLOY_ENV ?? "development");
    closing = await dispatch(argv);
  }

  if (closing && banners) {
    // Only prints when a prompt actually decided something — see
    // `reproducibleCommand`. Above the outro, so the takeaway is the last
    // thing on screen.
    const rerun = reproducibleCommand();
    if (rerun) note(rerun, "Run it directly next time");
    outro(closing);
  }
}

// Only for a direct `tsx src/cli.ts` run, bypassing `launch.ts` entirely: no
// tier resolved, no env entered.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(async (err: unknown) => {
    log.error(errorMessage(err));
    // Report BEFORE exiting — `process.exit` kills the event loop, taking any
    // in-flight request to Sentry's ingest endpoint with it.
    await captureDevtoolsError(err);
    process.exit(1);
  });
}
