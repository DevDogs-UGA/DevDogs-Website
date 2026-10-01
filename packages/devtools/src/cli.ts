/**
 * `pnpm devtools [--tier <development:local|development:remote|staging|production>] [command]`
 *
 * Run it with no arguments and it opens a menu. That is the point: a
 * contributor should be able to set up a database and check their moderation
 * integration without knowing a single command name, and without reading this
 * file first.
 *
 * The subcommands still exist for anyone who does know them, and for CI, which
 * cannot answer a prompt.
 *
 * ## One tree, many handlers
 *
 * `catalog.ts` composes the command tree from each domain's `catalog.ts`
 * (inert data). `help.ts` and `menu.ts` in `@devdogsuga/cli-core` render and
 * walk it, and the menu turns a walk into an argv that comes back through
 * `dispatch()` below, the same entry a typed command line takes. That is why
 * the menu covers everything the CLI does: there is no second list of commands
 * anywhere, so there is nothing to fall out of step. Each domain's
 * `commands.ts` owns its handlers; this file only maps names to them.
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
import { handleCf } from "./cf/commands.js";
import { handleCheck } from "./check/commands.js";
import { handleCompletions } from "./completions/commands.js";
import { handleCron } from "./cron/commands.js";
import { handleDb } from "./db/commands.js";
import { handleDoctor } from "./doctor/commands.js";
import { handleEmails } from "./emails/commands.js";
import { handleEnv } from "./env/commands.js";
import { handleGen } from "./gen/commands.js";
import { handleGithub } from "./gh/commands.js";
import { handleGrantRoot, handleRoles } from "./roles/commands.js";
import { handleImages } from "./images/commands.js";
import { handleOAuth } from "./oauth/commands.js";
import { handlePassthrough } from "./passthrough/commands.js";
import { handlePreset } from "./preset/commands.js";
import { runTask } from "./run/commands.js";
import { handleScript } from "./script/commands.js";
import { handleSetup } from "./setup/commands.js";
import { handleWorkflows } from "./workflows/commands.js";

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Commands that work against whatever tier the session points at, keyed by
 * top-level name. Each handler is owned by its domain's `commands.ts`; this
 * table is all `cli.ts` knows about them. (What always needs production
 * secrets, `deploy`, `env pull|push|audit` and `planner`, is the backstage
 * CLI's.)
 */
const CONTRIBUTOR_HANDLERS: Record<string, CommandHandler> = {
  setup: handleSetup,
  completions: handleCompletions,
  check: handleCheck,
  // Reached only from the wizard. A typed `run` is handled in `main()` before
  // `intro()`. It exits with its child's status, so it never returns and
  // `outro()` is never reached. That is right: by the time a menu walk gets
  // here the banner is already on screen, above the menu it introduced,
  // rather than wedged between this CLI and pnpm's output.
  run: runTask,
  oauth: handleOAuth,
  script: handleScript,
  images: handleImages,
  emails: handleEmails,
  cf: handleCf,
  gen: handleGen,
  cron: handleCron,
  github: handleGithub,
  workflows: handleWorkflows,
  env: handleEnv,
  db: handleDb,
  doctor: handleDoctor,
  preset: handlePreset,
  roles: handleRoles,
  "grant-root": handleGrantRoot,
};

/**
 * The real tools with the session's env and tier. A typed one is handled in
 * `main()` before `intro()`; these entries are for a dispatcher
 * that reaches them any other way.
 */
const PASSTHROUGH_TOOLS = [
  "supabase",
  "wrangler",
  "drizzle-kit",
  "psql",
] as const;
type PassthroughTool = (typeof PASSTHROUGH_TOOLS)[number];

function isPassthroughTool(name: string | undefined): name is PassthroughTool {
  return (PASSTHROUGH_TOOLS as readonly (string | undefined)[]).includes(name);
}

const PASSTHROUGH_HANDLERS: Record<string, CommandHandler> = Object.fromEntries(
  PASSTHROUGH_TOOLS.map((tool) => [
    tool,
    async (rest: string[]) => {
      await handlePassthrough(tool, rest);
      return process.exitCode ? null : DONE;
    },
  ]),
);

export const HANDLERS: Record<string, CommandHandler> = {
  ...CONTRIBUTOR_HANDLERS,
  ...PASSTHROUGH_HANDLERS,
};

/**
 * Names retired in favour of a new one, refused with the new name rather than
 * falling into "Unknown command": they are in this repo's own docs, scripts
 * and shell histories, so a bare "unknown" would leave the rename to be
 * rediscovered. `doctor` itself is NOT here: that name now belongs to the
 * environment checker, a deliberate reuse rather than a collision.
 */
const RETIRED: Record<string, { message: string; hints: string[] }> = {
  secrets: {
    message: "`secrets` is now `backstage env`.",
    hints: ["pnpm dlx @devdogsuga/backstage env <pull|push|audit>"],
  },
  // Commands that always need production secrets live in the officer CLI.
  bw: {
    message: "`bw` is gone: `backstage env` signs in to Bitwarden itself.",
    hints: ["pnpm dlx @devdogsuga/backstage env <pull|push|audit>"],
  },
  planner: {
    message: "`planner` moved to backstage.",
    hints: [
      "pnpm dlx @devdogsuga/backstage planner <status|create|reset-password|drop>",
    ],
  },
};

/**
 * Routes an argv to a command, and reports what to print when it returns.
 *
 * The wizard calls THIS rather than the command functions, so a menu walk and
 * a typed command line take the identical path. `deploy` is not routed here.
 * It is dispatched before `intro()` in `main()`.
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

  const retired = RETIRED[first];
  if (retired) {
    explain(retired.message, "", retired.hints);
    process.exitCode = 1;
    return null;
  }

  log.error(`Unknown command: ${first}`);
  // The top level only. The command is unknown, so there is no level below
  // it to describe, and reprinting the whole tree here is what made the old
  // help unreadable in the first place.
  log.message(renderHelp(catalog));
  process.exitCode = 1;
  return null;
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * Runs the CLI against an already-resolved argv.
 *
 * Exported rather than run at import, so `src/launch.ts` can resolve the
 * deploy tier and enter its environment BEFORE this module's imports (and the
 * commands they pull in) ever see `process.env` — see that file's header. The
 * shebang above stays harmless: importing this module runs nothing, only
 * `main()` does, and nothing calls it but `launch.ts` and the `import.meta.url`
 * guard at the bottom of this file, for a direct `tsx src/cli.ts` run.
 */
export async function main(argv: string[]): Promise<void> {
  // Bootstrapped here — after `argv` is parsed off `process.argv`, before any
  // dispatch below touches it — so the
  // `command` tag on whatever this run reports is the same argv every branch
  // below is about to act on. See `telemetry.ts`'s header for the no-op
  // contract when no DSN is configured.
  initDevtoolsTelemetry(argv[0] ?? "menu");

  // The real tools: `devtools supabase --help` is the
  // Supabase CLI's help. Before `intro()` too, so no banner lands above (or
  // an outro after) another tool's output.
  if (isPassthroughTool(argv[0])) {
    await handlePassthrough(argv[0], argv.slice(1));
    return;
  }

  // `--help --json` is the supported command list, for tools: every path the
  // CLI accepts, deprecated ones marked. Plain stdout, no banner. Only with no
  // command named, so `cron list --json --help` still answers about `cron list`.
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

  // `completions --shell bash|zsh` is meant for `eval "$(pnpm devtools
  // completions --shell bash)"`, which executes every line of stdout as a
  // shell command. Dispatched before `intro()` so the banner — and the
  // `outro()` below — never land on that stdout; a typed completions
  // invocation is never part of an interactive wizard walk, so there is no
  // banner worth keeping here the way there is for the menu.
  if (argv[0] === "completions") {
    await handleCompletions(argv.slice(1));
    return;
  }

  // Clean stdout, same reasoning as `completions` above: mostly useful for
  // confirming which build actually ran.
  if (argv[0] === "version") {
    process.stdout.write(`${ownVersion()}\n`);
    return;
  }

  // Deploys moved to the officer CLI. Point any stray invocation at it before
  // `intro()`, because a deploy step's stdout can be a credential channel and
  // must never carry the wizard banner.
  if (argv[0] === "deploy") {
    process.stderr.write(
      "deploy has moved to backstage.\n" +
        "  Use: pnpm dlx @devdogsuga/backstage deploy <step|app> [flags]\n",
    );
    process.exitCode = 1;
    return;
  }

  // A bare command group at a terminal resumes the wizard at that node, so
  // `devtools db` opens db's subcommand screen instead of printing "which of …?"
  // and exiting 1. Placed here — before `run`'s passthrough and before intro() —
  // so every group routes the same way (bare `run` resumes too, while
  // `run <task>` resolves to a leaf and falls through). Non-interactive callers
  // get startPath === null and keep the dispatcher's error + exit 1.
  const startPath = process.stdin.isTTY
    ? bareGroupStartPath(catalog, argv)
    : null;

  // Also before `intro()`, for the neighbouring reason: this one hands stdout
  // to pnpm, and through it to a Next dev server or a Flutter run that owns
  // the terminal until Ctrl-C. A banner above that output would be this CLI
  // announcing itself over somebody else's, and the `outro()` below would
  // print "Done." after a dev server was interrupted. `runTask` exits with
  // the child's own status and never comes back. `!startPath` excludes the one
  // case that is not this: a bare `run` at a terminal, which the block above
  // already resolved to its own subcommand screen rather than a task to run.
  if (!startPath && argv[0] === "run") {
    await runTask(argv.slice(1));
    return;
  }

  // No banner without a terminal: a log, a pipe or a CI step wants plain
  // lines (see `@devdogsuga/cli-core/mode`).
  const banners = !isNonInteractive();
  if (banners) intro("DevDogs devtools");

  // The wizard builds an argv and hands it back to `dispatch`. See `menu.ts`.
  // `runMenu` begins its own recording from the built argv; a typed command
  // begins here, non-interactive until a runner resolves a flag from a prompt.
  let closing: string | null;
  if (argv.length === 0) {
    closing = await runMenu(catalog, dispatch);
  } else if (startPath) {
    // Same wizard entry as the no-argument path, at the resumed node instead
    // of the first screen. `env` left `undefined` so `runMenu` probes once,
    // identically to the bare-invocation branch above.
    closing = await runMenu(catalog, dispatch, undefined, { startPath });
  } else {
    beginInvocation(argv, false);
    // `launch.ts` already resolved and entered the session's deploy tier —
    // see its header — so `process.env.DEPLOY_ENV` names it here for every
    // path, typed or menu-built, rather than this module resolving a second
    // opinion.
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

// Only for a direct `tsx src/cli.ts` run, bypassing `launch.ts` entirely —
// no deploy tier resolved, no env entered. Not a path anything in this repo
// takes any more (`launch.ts` always runs first, see its header), kept as a
// fallback for the same reason `ci.ts`'s guard is.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(async (err: unknown) => {
    log.error(errorMessage(err));
    // Report BEFORE exiting — `process.exit` kills the event loop, taking any
    // in-flight request to Sentry's ingest endpoint with it. See
    // `captureDevtoolsError`'s header.
    await captureDevtoolsError(err);
    process.exit(1);
  });
}
