/**
 * The wizard: `pnpm devtools` with no arguments.
 *
 * ## The one property worth protecting
 *
 * **It builds an argv and hands it to the CLI's own dispatcher.** It does not
 * call command functions directly. That is what makes "the menu covers every
 * interactive command" structural instead of aspirational. The menu it replaced held a
 * hand-written list of ten entries beside a CLI that had grown to sixteen
 * top-level commands and thirty-one subcommands, so `env`, `planner` and
 * `docs index` were reachable only by someone who already knew their names.
 * A contributor who does not know a command name is the entire audience for
 * this file.
 *
 * Walking the catalog means an interactive command added there is in the
 * menu the same day, with its options. Commands marked `cli-only` do not appear here.
 *
 * ## One flat first screen
 *
 * The first screen lists every top-level command, in the catalog's order,
 * under its `title`: "Restart local Supabase" rather than `restart-stack`.
 * There used to be a screen of groups above it, which put a door between the
 * reader and every command and named the doors after how the CLI is built
 * rather than what the reader came to do. The command's real name rides in
 * the hint (`restart-stack · …`), so a walk still teaches what to type next
 * time. Aliases are never drawn: the menu builds an argv for a real command.
 */
import { confirm, note, select, text } from "@clack/prompts";
import { positionals } from "@devdogsuga/cli-core/args";
import {
  SCOPES,
  type Catalog,
  type CommandNode,
  type CommandOption,
} from "./catalog.js";
import { takeMenuEnvHook } from "@devdogsuga/cli-core/env-entry";
import {
  describeEnvironment,
  isOffered,
  probeEnvironment,
  type Environment,
} from "./environment.js";
import {
  beginInvocation,
  recordEnteredTier,
} from "@devdogsuga/cli-core/invocation";
import { unwrap } from "@devdogsuga/cli-core/ui";

/** Chosen when a submenu should return to the screen above it. */
const BACK = Symbol("back");
type Back = typeof BACK;

const BACK_OPTION = { value: BACK, label: "← Back" } as const;

// ── What this machine is offered ─────────────────────────────────────────────

/**
 * The commands at one level that are worth showing right now.
 *
 * `when` is the only thing that removes an entry, and it removes very few;
 * see `isOffered`. Everything else stays on screen and explains itself
 * through `hintFor` below, because the menu's job is to help someone who does
 * not know a command's name, and it cannot do that for a command it declined
 * to draw.
 */
function offered(
  nodes: readonly CommandNode[],
  env: Environment,
): CommandNode[] {
  return nodes.filter(
    (node) => node.surface !== "cli-only" && isOffered(node, env),
  );
}

/** The line beside a name. */
function hintFor(node: CommandNode): string {
  const said = node.hint ?? node.summary;

  // The scope leads, because in the one group that has scopes it is the thing
  // the reader is actually choosing between: `restart` and `reset` sit four
  // lines apart and act on different layers.
  return node.scope ? `${SCOPES[node.scope].menu} · ${said}` : said;
}

/**
 * One command's entry on a screen: its title, with its real name leading the
 * hint so the reader learns what to type. A command with no title is labelled
 * by its name, which then has no reason to appear twice.
 */
function entryFor(node: CommandNode): { label: string; hint: string } {
  return node.title
    ? { label: node.title, hint: `${node.name} · ${hintFor(node)}` }
    : { label: node.name, hint: hintFor(node) };
}

// ── Screens ──────────────────────────────────────────────────────────────────

async function pickTopLevel(
  catalog: Catalog,
  env: Environment,
): Promise<CommandNode | null> {
  return unwrap(
    await select<CommandNode | null>({
      message: "What would you like to do?",
      options: [
        ...offered(catalog.topLevel, env).map((command) => ({
          value: command,
          ...entryFor(command),
        })),
        { value: null, label: "Quit" },
      ],
    }),
  );
}

async function pickSubcommand(
  node: CommandNode,
  env: Environment,
): Promise<CommandNode | Back> {
  return unwrap(
    await select<CommandNode | Back>({
      message: `${node.title ?? node.name}:`,
      options: [
        ...offered(node.subcommands ?? [], env).map((child) => ({
          value: child,
          ...entryFor(child),
        })),
        BACK_OPTION,
      ],
    }),
  );
}

// ── Options ──────────────────────────────────────────────────────────────────

/**
 * Asks for one option, returning the argv fragment it contributes.
 *
 * An empty array is a real answer, not a failure: a declined confirm adds no
 * flag, and a blank optional text means "let the command decide", which is
 * how `--db-url` falls back to `.env.production`.
 */
async function askOption(option: CommandOption): Promise<string[]> {
  const prompt = option.prompt;
  if (!prompt) return [];

  if (prompt.kind === "confirm") {
    // Yes adds the flag, always. each option's declaration phrases every message so that
    // this needs no per-option inversion.
    const yes = unwrap(
      await confirm({ message: prompt.message, initialValue: prompt.initial }),
    );
    return yes ? [option.flag] : [];
  }

  if (prompt.kind === "text") {
    const answer = unwrap(
      await text({
        message: prompt.message,
        placeholder: prompt.placeholder,
        defaultValue: "",
      }),
    ).trim();
    return answer ? [option.flag, answer] : [];
  }

  const choice = unwrap(
    await select({
      message: prompt.message,
      options: prompt.choices.map((c) => ({
        value: c.value,
        label: c.label ?? c.value,
        hint: c.hint,
      })),
    }),
  );

  return [option.flag, choice];
}

async function askOptions(node: CommandNode): Promise<string[]> {
  const argv: string[] = [];
  for (const option of node.options ?? []) {
    argv.push(...(await askOption(option)));
  }
  return argv;
}

// ── Walk ─────────────────────────────────────────────────────────────────────

/** The path and flags a walk produced, or `null` if the reader backed out. */
interface Chosen {
  node: CommandNode;
  argv: string[];
}

/**
 * Descends from `start` through its subcommand screens to a leaf, then asks
 * that leaf's options.
 *
 * Shared by both entries into a walk: the top-of-tree loop below, which calls
 * this once a top-level command is chosen, and a resumed walk
 * (`walk`'s `startPath` branch), which calls it directly on a node the caller
 * already picked by argv. `while` rather than a single step because the tree
 * is two deep today and this does not care. The condition counts the OFFERED
 * children rather than all of them, so a node whose every subcommand is
 * hidden is treated as the leaf it has become instead of opening a screen
 * holding only "Back".
 */
async function descendFrom(
  start: CommandNode,
  pathNames: string[],
  env: Environment,
  carried: readonly string[] = [],
): Promise<Chosen | Back> {
  let node = start;
  const path = [...pathNames];
  while (offered(node.subcommands ?? [], env).length > 0) {
    const child = await pickSubcommand(node, env);
    if (child === BACK) return BACK;
    node = child;
    path.push(node.name);
  }
  return { node, argv: [...path, ...(await askOptions(node)), ...carried] };
}

/**
 * Walks the tree to a leaf and its options, either from the top or resumed at
 * a known group.
 *
 * `startPath`, when given, is a path to a group node from `bareGroupStartPath`
 * — `["jobs"]` for `devtools jobs` — and lands here instead of at the first
 * screen. There is no screen above a resumed node (the caller already named
 * it by typing `jobs`), so BACK on its first subcommand screen has nowhere to
 * return to but out, unlike BACK from the top of the tree, which returns to
 * the first screen. `startFlags` are the flags typed beside it, carried onto
 * the end of the argv the walk builds.
 */
async function walk(
  catalog: Catalog,
  env: Environment,
  startPath?: string[],
  startFlags: readonly string[] = [],
): Promise<Chosen | null> {
  if (startPath) {
    const start = catalog.findCommand(startPath);
    const path = catalog.canonicalPath(startPath);
    if (!start || !path) return null; // defensive: the caller guarantees a group node
    const chosen = await descendFrom(start, path, env, startFlags);
    return chosen === BACK ? null : chosen;
  }

  for (;;) {
    const first = await pickTopLevel(catalog, env);
    if (!first) return null;

    const chosen = await descendFrom(first, [first.name], env);
    if (chosen === BACK) continue;

    return chosen;
  }
}

// ── Resuming at a node ───────────────────────────────────────────────────────

/**
 * The command path when argv names a group with subcommands but no subcommand
 * token — what `devtools db` and `devtools db seed` are. Returns null for a
 * leaf command, an unknown token, or a bare invocation (which the no-argument
 * wizard already covers). The caller resumes the wizard at this node when
 * stdin is a TTY; a non-TTY caller keeps the dispatcher's "which of …?" exit.
 */
export function bareGroupStartPath(
  catalog: Catalog,
  argv: readonly string[],
): string[] | null {
  const path = positionals(argv);
  if (path.length === 0) return null;
  const node = catalog.findCommand(path);
  if (!node || (node.subcommands ?? []).length === 0) return null;
  return path;
}

/**
 * The flags in `argv` beside a bare group's `path`, for `runMenu`'s
 * `startFlags`: what `devtools jobs --kind sync` (or the `cron` alias that
 * stands for it) keeps once the wizard resumes at `jobs`.
 */
export function bareGroupStartFlags(
  argv: readonly string[],
  path: readonly string[],
): string[] {
  const rest = [...argv];
  for (const name of path) {
    const at = rest.indexOf(name);
    if (at !== -1) rest.splice(at, 1);
  }
  return rest;
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * Runs the wizard, returning the `outro()` line its command earned.
 *
 * `dispatch` is the CLI's own argv handler, injected rather than imported so
 * that the CLI keeps a single definition of what each command does and the
 * tests can watch what a walk produces without running it. Its return value
 * passes straight through, the closing line or `null` for a failure already
 * explained, so a command reached from the menu signs off exactly as it does
 * from the command line.
 *
 * `options.startPath`, from `bareGroupStartPath`, skips straight to that
 * node's subcommand screen — see `walk`'s `startPath` branch — and
 * `options.startFlags` (from `bareGroupStartFlags`) rides along to the end.
 *
 * The deploy tier is NOT asked here any more. `src/launch.ts` resolves it
 * before `cli.ts` — and therefore this module — is even imported, and
 * exports `DEPLOY_ENV`/`DEV_DB` right away, so by the time the wizard opens
 * `process.env` already names the session exactly as if `--tier` had been
 * typed. Recording it for the "run it directly next time" line only needs to
 * read `process.env.DEPLOY_ENV` back.
 *
 * Entering that tier — loading its `.env.<tier>` file onto `process.env` —
 * is what's deferred: `launch.ts` registers a hook (`env-entry.ts`'s
 * `setMenuEnvHook`) instead of entering up front, so whatever changed while
 * the reader was still walking the menu (the local stack coming up in
 * another terminal, `.env.generated` being rewritten) is picked up rather
 * than missed. `takeMenuEnvHook()` below runs it right before the chosen
 * command dispatches — the ONE place in a menu walk an env value is ever
 * actually read. `undefined` (no hook registered — a typed command entered
 * already, or a test drives `runMenu` directly) just dispatches straight
 * through, unchanged from before this existed.
 */
export async function runMenu(
  catalog: Catalog,
  dispatch: (argv: string[]) => Promise<string | null>,
  env: Environment = probeEnvironment(),
  options: {
    startPath?: string[];
    startFlags?: readonly string[];
  } = {},
): Promise<string | null> {
  // Before the first question, not after a failure. Three lines saying what
  // this machine currently is explain why the database commands below are
  // flagged, and cost one glance on a healthy machine. Injected rather than
  // probed inside `walk` so the tests can drive a machine they describe
  // instead of the one they happen to run on.
  note(describeEnvironment(env), "This machine");

  const chosen = await walk(
    catalog,
    env,
    options.startPath,
    options.startFlags,
  );
  // Quitting is not a failure, but it has nothing to announce either.
  if (!chosen) return null;

  // Every step here was a prompt, so the built argv is the reproducible
  // command — a runner that prompts further (a bare `jobs run`) appends
  // the rest through `recordResolved`, and the entered tier rides along as the
  // `--tier` flag `recordEnteredTier` adds.
  beginInvocation(chosen.argv, true);
  // A development session that answered the "which development database?"
  // question records the QUALIFIED selector, so the "run it directly next
  // time" line reproduces the whole session — a bare `development` would
  // re-ask (or refuse, non-interactively) on a machine whose `.env` names a
  // remote DB_URL.
  const enteredTier = process.env.DEPLOY_ENV ?? "development";
  const devDb = process.env.DEV_DB;
  recordEnteredTier(
    enteredTier === "development" && (devDb === "local" || devDb === "remote")
      ? `development:${devDb}`
      : enteredTier,
  );

  // The deferred entry, if `launch.ts` registered one — see this function's
  // header. Read-and-cleared in one call so a nested launcher (this same
  // command re-dispatching through its own `launch()`, e.g. `db start`'s
  // offline-stack offer) never inherits a hook meant for this walk.
  const enterEnvironment = takeMenuEnvHook();
  if (enterEnvironment) {
    return enterEnvironment(chosen.argv, () => dispatch(chosen.argv));
  }
  return dispatch(chosen.argv);
}
