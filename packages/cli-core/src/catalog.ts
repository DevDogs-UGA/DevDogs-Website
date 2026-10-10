/**
 * The command catalog: types, shared option shapes and the lookups over a
 * composed tree.
 *
 * A CLI's command tree is data. Each domain declares its own commands in its
 * `catalog.ts` (names, summaries and option shapes, nothing that runs), the
 * CLI's `src/catalog.ts` composes those into groups, and `createCatalog`
 * wraps the result. Three readers consume it:
 *
 *   * `help.ts` renders it, one level at a time.
 *   * `menu.ts` walks its interactive commands and options without a second
 *     list to keep in step.
 *   * `completions.ts` enumerates it, and contributor documentation uses the
 *     same group and command vocabulary.
 *
 * It is deliberately inert: no imports of anything that runs (`args.ts` is
 * data too), so the launcher can read it (for `envFree`) before the session's
 * environment is entered.
 * The CLI's dispatcher owns the handlers, and the wizard turns a walk of this
 * tree into an argv and hands it to that same dispatcher, which keeps menu and
 * CLI behavior aligned by construction rather than by review.
 *
 * ## What a summary is for
 *
 * Every `summary` is one line and is the ONLY thing `--help` prints for a
 * command at the level above it. Rationale, target tables, credential lookup
 * order and deploy internals live in `docs/`, not here: `--help` is a map, and
 * a map that reprints the territory is the thing this replaced.
 */

import { VALUE_FLAGS } from "./args.js";

/**
 * One choice in a select prompt.
 *
 * `value` is the value the wizard passes for the option's own flag — e.g.
 * `local`/`remote` for `--target`. The menu always emits `[flag, value]`.
 */
export interface OptionChoice {
  value: string;
  label?: string;
  hint?: string;
}

/**
 * A prompt the wizard raises to fill an option the command line would carry.
 *
 * `confirm` has no polarity switch on purpose: **yes adds the flag**, always.
 * So every message here is phrased so yes is the flag's own meaning ("Skip the
 * duplicate scan?" rather than "Scan for duplicates?"). That leaves the wizard
 * without a second place to get an inversion wrong.
 */
export type OptionPrompt =
  | { kind: "confirm"; message: string; initial: boolean }
  | { kind: "select"; message: string; choices: readonly OptionChoice[] }
  | { kind: "text"; message: string; placeholder?: string; optional?: boolean };

export interface CommandOption {
  /** `--target`. */
  flag: string;
  /** `<t>` for a flag that takes a value; absent for a boolean. */
  value?: string;
  /** One line. Printed by `devtools <command> --help`. */
  summary: string;
  /**
   * How the wizard asks for it.
   *
   * Absent means the wizard does not ask HERE, a decision rather than an
   * omission. Three kinds of option are deliberately promptless:
   *
   *   * ones the command asks for ITSELF, from something live. `--app` picks
   *     from the apps in the database, `--user` from the accounts on it,
   *     `--target` from `bws/pick.ts`'s danger-ordered list, `--apps` from the env
   *     registry. A wizard text box would be a worse version of a menu that
   *     already exists, and `--target`'s would put production one keystroke
   *     closer than `bws/pick.ts` deliberately puts it;
   *   * ones that exist to SUPPRESS a prompt (`--yes`), meaningless in a
   *     wizard, which is the prompt;
   *   * ones that carry a credential (`--access-token`). The interactive path
   *     resolves it better, and typing it makes it visible to `ps` and shell
   *     history.
   *
   * So every option is reachable from the menu; what varies is which screen
   * asks. `commands.test.ts` pins the promptless set so a fourth case has to be
   * argued for rather than accumulate.
   */
  prompt?: OptionPrompt;
}

/**
 * Something about the machine that a command cares about.
 *
 * A string rather than a predicate, so this file stays what its header says it
 * is: data. `environment.ts` is the only module that knows what these mean,
 * `menu.ts` acts on them, and the docs build can render "shown when the local
 * stack is running" without being able to run anything.
 */
export type Condition = "docker" | "instance-running" | "instance-stopped";

/**
 * Which layer of the database group a command acts on.
 *
 * Groups like Supabase and (future) `db` span multiple layers: the local
 * Docker stack, the Postgres database inside it, and hosted endpoints. Scopes
 * let `--help` head each run and the wizard put the layer on every line,
 * so a contributor chooses deliberately rather than by accident.
 *
 *   `machine`  — acts on this machine's containers (`link`, `stop`, `restart`)
 *   `repo`     — reads or writes repository files only (no live connection)
 *   `endpoint` — connects to the SESSION's database (picked once at launch,
 *                `--tier development:local|development:remote|staging|production`)
 *   `infra`    — infrastructure-level; touches roles, credentials, or config
 */
export type Scope = "machine" | "repo" | "endpoint" | "infra";

/**
 * How each scope reads, in the two places that draw it.
 *
 * `menu` sits inline in a hint, so it is one word. `help` heads a block of
 * commands, so it can be a phrase. Both live here rather than in the renderers
 * because they are labels, the same kind of data as a group title.
 */
export const SCOPES: Record<Scope, { menu: string; help: string }> = {
  machine: { menu: "This machine", help: "Supabase on this machine" },
  repo: { menu: "Repo", help: "files in the repo" },
  endpoint: { menu: "Database", help: "the session's database (--tier)" },
  infra: {
    menu: "Hosted",
    help: "hosted infrastructure, each naming its own connection",
  },
};

/**
 * Another name a command answers to.
 *
 * A typed alias resolves to its command everywhere: dispatch, `--help`, the
 * wizard's resume and completions. The wizard never draws one, and `--help`
 * lists it beside the command rather than as a command of its own, so there
 * is still one node to keep in step.
 */
export interface CommandAlias {
  name: string;
  /**
   * Flags the alias stands for, appended to what was typed: `cron run` is
   * `jobs run --kind sync`. `canonicalArgv` adds them, so a handler only ever
   * sees the command's own name and flags it already declares.
   */
  implies?: readonly string[];
}

export interface CommandNode {
  name: string;
  /**
   * The wizard's label, in words a contributor who knows no command names can
   * pick from ("Restart local Supabase"). The menu only: `--help`, the argv a
   * walk builds and completions keep `name`, and the wizard prints `name`
   * beside the title so the reader learns it.
   */
  title?: string;
  /** One line. See the header. */
  summary: string;
  /** Sits beside the name in the wizard; shorter than the summary. */
  hint?: string;
  /** Other names this command answers to. See `CommandAlias`. */
  aliases?: readonly CommandAlias[];
  options?: readonly CommandOption[];
  subcommands?: readonly CommandNode[];
  /**
   * Offer this in the wizard only while the condition holds.
   *
   * For commands that are *meaningless* otherwise, not merely inconvenient:
   * stopping a stack that is already stopped is the whole of the category. A
   * command that would run and fail with a good message stays on screen. See
   * `isOffered` in `environment.ts` for why hiding is the rarer choice.
   *
   * Wizard-only. `--help`, the dispatcher and the generated reference all
   * ignore this, so nothing here removes a command from the CLI.
   */
  when?: Condition;
  /**
   * Which layer this acts on, for a group that spans several. See `Scope`.
   *
   * Groups like Supabase span the stack on this machine and the database
   * inside it.
   * `--help` heads a block with it; the wizard puts it on the line.
   */
  scope?: Scope;
  /**
   * Where this command may be reached.
   *
   * Most commands are interactive and therefore appear in both the menu and
   * `--help`. `cli-only` commands still appear in help and completions, but do
   * not get a GUI entry: their output is meant to be consumed by a shell.
   */
  surface?: "interactive" | "cli-only";
  /**
   * A thin alias kept for callers that have not moved yet: what replaces it.
   *
   * Help marks the command, the dispatcher still runs it, and
   * `--help --json` carries the text so a docs check can refuse a page that
   * documents it. Deprecated commands are also `cli-only`, so the wizard never
   * offers them.
   */
  deprecated?: string;
  /**
   * This command reads and writes no DevDogsUGA env file, database, or
   * `DEPLOY_ENV` — `launch.ts` may enter plain `development` for it with no
   * tier prompt and no multi-tier refusal, exactly like the hardcoded
   * `setup`/`completions` bypass it already carries (see that file's
   * `launch()` for why those two cannot go through ordinary tier
   * resolution).
   *
   * Both `github rulesets` and `github settings` are the first commands to
   * use this flag rather than joining that hardcoded name check: everything
   * either one touches is a `gh api` call against GitHub itself, resolved
   * from `--org`/`--repo` flags, not from the session's deploy tier — so
   * `--tier` was never a real requirement, only an artifact of every command
   * going through the same tier-resolution gate before dispatch. Marked on
   * the leaf command (`rulesets`, `settings`), not the `github` group node,
   * because `launch.ts` looks up the exact dispatched path.
   */
  envFree?: boolean;
  /**
   * This command reads nothing but the checkout, so the launcher behaves as if
   * `--no-env` was typed: development is named and no env file is loaded, or
   * complained about when it is missing. For the `check` commands, which CI
   * runs on a runner with no `.env`. Implies `envFree`.
   */
  noEnv?: boolean;
  /**
   * How this command treats `--dry-run` (see `dry-run.ts`).
   *
   *   * `read-only`: nothing to skip; it runs normally.
   *   * `handled`: it honours the flag itself, either through `runInGroup`
   *     (which prints instead of spawning) or its own `--dry-run` option.
   *
   * Absent means the command spawns or writes and says nothing about the
   * flag, so the dispatcher prints the command and stops. Inherited by
   * subcommands that do not say otherwise.
   */
  dryRun?: "read-only" | "handled";
}

/**
 * Top-level sections of `--help`. The wizard's first screen is flat (every
 * top-level command, in group order), so a group decides where a command sits
 * in that list but draws nothing of its own there.
 */
export interface CommandGroup {
  title: string;
  commands: readonly CommandNode[];
}

// ── Exit codes ───────────────────────────────────────────────────────────────

/** Standard success. */
export const EXIT_OK = 0;
/** Command failed. */
export const EXIT_FAIL = 1;
/** `--check` found drift. Distinct from failure so scripts can tell them apart. */
export const EXIT_DRIFT = 2;

// ── Shared option shapes ─────────────────────────────────────────────────────

/**
 * The deployment-tier selector, for the commands that resolve a tier of
 * their OWN (`jobs run` against a chosen tier's env). The session's
 * global `--tier` — `development:local|development:remote|staging|production`,
 * stripped by the launcher before dispatch — is a superset of this
 * vocabulary; this per-command flag still reads plain tiers.
 */
export const TIER: CommandOption = {
  flag: "--tier",
  value: "<t>",
  summary: "Which deployment tier. Asked for when absent.",
};

/** Print what would change; write nothing; exit 0. On every command that writes. */
export const DRY_RUN: CommandOption = {
  flag: "--dry-run",
  summary: "Print what would change, write nothing, exit 0.",
};

/** Verify correctness; write nothing; exit 2 on drift. */
export const CHECK: CommandOption = {
  flag: "--check",
  summary: "Verify, write nothing, exit 2 on drift.",
};

/**
 * Machine-readable output to stdout.
 *
 * Promptless by design: the wizard is already interactive; a flag that switches
 * its output format has no meaning there. `commands.test.ts` pins the promptless
 * set with a "scripting-only" category for exactly this kind of flag.
 */
export const JSON_FLAG: CommandOption = {
  flag: "--json",
  summary: "Print machine-readable JSON to stdout.",
};

/** Skip every interactive confirmation prompt. On every destructive command. */
export const YES: CommandOption = {
  flag: "--yes",
  summary: "Skip the confirmations.",
};

// ── The composed tree ────────────────────────────────────────────────────────

/**
 * A composed command tree and the lookups over it.
 *
 * `groups` is what `--help` and the wizard show; `ciGroups` is an optional
 * second tree, never reached from the wizard and never rendered in `--help`.
 * Neither CLI declares one now that `devtools-ci` is gone.
 */
export interface Catalog {
  /** How the CLI is invoked, as `--help` prints it: `pnpm devtools`. */
  readonly usage: string;
  /** The `Common tasks` block at the top of the root `--help`: [command, what it does]. */
  readonly commonTasks: readonly (readonly [string, string])[];
  readonly groups: readonly CommandGroup[];
  readonly ciGroups: readonly CommandGroup[];
  /** Every top-level command, in group order. */
  readonly topLevel: readonly CommandNode[];
  /** Every top-level CI command, in group order. */
  readonly ciTopLevel: readonly CommandNode[];
  /**
   * Walks a path like `["env", "pull"]`, returning `null` at the first miss.
   *
   * Callers use `null` to mean "not a command", which is the same answer the
   * dispatcher gives, so an unknown name reads the same whichever notices
   * first.
   */
  findCommand: (path: readonly string[]) => CommandNode | null;
  /** `findCommand` over the CI tree. */
  findCiCommand: (path: readonly string[]) => CommandNode | null;
  /** The `--help` section a top-level command sits in. */
  groupOf: (name: string) => CommandGroup | undefined;
  /**
   * A path with every alias replaced by the name it stands for: `["cron",
   * "run"]` is `["jobs", "run"]`. `null` where `findCommand` would be.
   */
  canonicalPath: (path: readonly string[]) => string[] | null;
  /**
   * The argv a typed alias stands for: its command path renamed, and its
   * `implies` flags appended. Anything that is not a command path passes
   * through untouched, so this is safe to run on every argv before dispatch.
   */
  canonicalArgv: (argv: readonly string[]) => string[];
  /**
   * The subcommand names under a path, in the order they are declared.
   *
   * This is what the dispatchers validate against. A subcommand the tree does
   * not declare is refused by the CLI, and an interactive one it does declare
   * is in the menu. There is one list, and this reads it.
   */
  subcommandNames: (path: readonly string[]) => string[];
  /** The subcommand names under a CI path. */
  subcommandCiNames: (path: readonly string[]) => string[];
  /** `pull, push, audit, init, example or reset`, for a refusal message. */
  subcommandList: (path: readonly string[]) => string;
  /**
   * Every command path in the tree, deepest names included.
   *
   * Used by the coverage test, and by anything that wants to enumerate the
   * CLI (the docs build's reference page is the intended second caller).
   */
  allPaths: () => string[][];
}

/** The node a typed token names among `nodes`, by its name or an alias. */
function named(
  nodes: readonly CommandNode[],
  token: string,
): { node: CommandNode; alias?: CommandAlias } | undefined {
  for (const node of nodes) {
    if (node.name === token) return { node };
    const alias = node.aliases?.find((candidate) => candidate.name === token);
    if (alias) return { node, alias };
  }
  return undefined;
}

/** Each step of a path, resolved through aliases; `null` at the first miss. */
function resolve(
  roots: readonly CommandNode[],
  path: readonly string[],
): { node: CommandNode; alias?: CommandAlias }[] | null {
  let nodes = roots;
  const steps: { node: CommandNode; alias?: CommandAlias }[] = [];

  for (const token of path) {
    const step = named(nodes, token);
    if (!step) return null;
    steps.push(step);
    nodes = step.node.subcommands ?? [];
  }

  return steps;
}

function walk(
  roots: readonly CommandNode[],
  path: readonly string[],
): CommandNode | null {
  return resolve(roots, path)?.at(-1)?.node ?? null;
}

/**
 * Refuses a tree where one token could name two siblings. An alias that
 * shadowed another command would make which one runs depend on declaration
 * order, the kind of thing nobody finds until it has run the wrong one.
 */
function assertUnambiguous(
  nodes: readonly CommandNode[],
  prefix: readonly string[],
): void {
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const token of [
      node.name,
      ...(node.aliases ?? []).map((a) => a.name),
    ]) {
      if (seen.has(token)) {
        throw new Error(
          `Command tree: "${[...prefix, token].join(" ")}" names two commands.`,
        );
      }
      seen.add(token);
    }
    assertUnambiguous(node.subcommands ?? [], [...prefix, node.name]);
  }
}

export function createCatalog(trees: {
  usage: string;
  commonTasks?: readonly (readonly [string, string])[];
  groups: readonly CommandGroup[];
  ciGroups?: readonly CommandGroup[];
}): Catalog {
  const groups = trees.groups;
  const ciGroups = trees.ciGroups ?? [];
  const topLevel = groups.flatMap((group) => group.commands);
  const ciTopLevel = ciGroups.flatMap((group) => group.commands);
  assertUnambiguous(topLevel, []);
  assertUnambiguous(ciTopLevel, []);

  const subcommandNames = (path: readonly string[]): string[] =>
    (walk(topLevel, path)?.subcommands ?? []).map((node) => node.name);

  return {
    usage: trees.usage,
    commonTasks: trees.commonTasks ?? [],
    groups,
    ciGroups,
    topLevel,
    ciTopLevel,
    findCommand: (path) => walk(topLevel, path),
    findCiCommand: (path) => walk(ciTopLevel, path),
    groupOf: (name) =>
      groups.find((group) =>
        group.commands.some((command) => command.name === name),
      ),
    canonicalPath: (path) =>
      resolve(topLevel, path)?.map((step) => step.node.name) ?? null,
    canonicalArgv: (argv) => {
      // The command path is the leading run of positionals; flags (and the
      // values `VALUE_FLAGS` take) can sit anywhere around it.
      const out = [...argv];
      const implied: string[] = [];
      let nodes: readonly CommandNode[] = topLevel;
      for (let i = 0; i < out.length; i += 1) {
        const arg = out[i]!;
        if (arg.startsWith("-")) {
          const next = out[i + 1];
          if (
            VALUE_FLAGS.has(arg) &&
            next !== undefined &&
            !next.startsWith("-")
          ) {
            i += 1;
          }
          continue;
        }
        const step = named(nodes, arg);
        if (!step) break;
        out[i] = step.node.name;
        implied.push(...(step.alias?.implies ?? []));
        nodes = step.node.subcommands ?? [];
      }
      return [...out, ...implied];
    },
    subcommandNames,
    subcommandCiNames: (path) =>
      (walk(ciTopLevel, path)?.subcommands ?? []).map((node) => node.name),
    subcommandList: (path) => {
      const names = subcommandNames(path);
      if (names.length <= 1) return names.join("");
      return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]!}`;
    },
    allPaths: () => {
      const paths: string[][] = [];
      const visit = (nodes: readonly CommandNode[], prefix: string[]): void => {
        for (const node of nodes) {
          const path = [...prefix, node.name];
          paths.push(path);
          visit(node.subcommands ?? [], path);
        }
      };
      visit(topLevel, []);
      return paths;
    },
  };
}
