/**
 * `devtools jobs run|list|serve`, and the `cron`/`workflows` aliases that
 * narrow it to one kind.
 *
 * An app's background work comes in two kinds, and a contributor picking one
 * to run should not have to know which mechanism carries it:
 *
 *   * quick syncs: a Worker cron trigger that calls a route from the app's
 *     `CRON_ROUTES` (`cron/commands.ts` runs one);
 *   * long-running jobs: a Cloudflare Workflow binding (`workflows/commands.ts`
 *     runs and serves one). An app's `WORKFLOW_CRONS` labels the schedules
 *     that start its Workflows, so those list here too.
 *
 * This module only decides which of the two a request is about, draws the one
 * picker and the one list over both, and hands off. `--cron` implies a sync and
 * `--workflow` a long-running job; `--kind` (what the aliases stand for) narrows
 * the picker and the list.
 */
import { select } from "@clack/prompts";
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { recordResolved } from "@devdogsuga/cli-core/invocation";
import { unwrap } from "@devdogsuga/cli-core/ui";
import {
  cronChoices,
  describeExpr,
  reconcileMap,
  runCronRun,
} from "../cron/commands.js";
import {
  CRON_TIERS,
  discoverCronMaps,
  discoverWranglerConfigs,
  isCronTier,
  type CronTier,
} from "../cron/discovery.js";
import {
  runWorkflowsRun,
  runWorkflowsServe,
  workflowChoices,
} from "../workflows/commands.js";

export const JOB_KINDS = ["sync", "long-running"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as readonly string[]).includes(value);
}

/**
 * How each kind is introduced, in the picker and in `list`. Said once, here,
 * rather than per app: the apps' own labels say what each job does.
 */
export const KIND_HEADINGS: Record<
  JobKind,
  { title: string; description: string }
> = {
  sync: {
    title: "Quick syncs",
    description:
      "The platform calls these on a timer; each finishes in seconds.",
  },
  "long-running": {
    title: "Long-running jobs",
    description: "Multi-step work that retries and resumes where it stopped.",
  },
};

/**
 * The kinds a request covers: both, unless `--kind` narrows it.
 *
 * Every `--kind` is read, not just the first, because an alias appends its
 * own: `cron run --kind long-running` asks for two things at once, and
 * running either would be a guess. `null` after saying so.
 */
export function kindsOf(
  argv: readonly string[],
  command: string,
): readonly JobKind[] | null {
  const given = new Set<string>();
  argv.forEach((arg, index) => {
    if (arg === "--kind") given.add(argv[index + 1] ?? "");
  });
  if (given.size === 0) return JOB_KINDS;
  const [kind] = given;
  if (given.size > 1 || kind === undefined || !isJobKind(kind)) {
    process.stderr.write(
      `devtools jobs ${command}: --kind must be one of ${JOB_KINDS.join(" or ")}` +
        (given.size > 1
          ? ` (\`cron\` already means sync, \`workflows\` long-running).\n`
          : ".\n"),
    );
    return null;
  }
  return [kind];
}

// ── run ──────────────────────────────────────────────────────────────────────

/** One runnable job in the picker. */
export type JobPick =
  | { kind: "sync"; app: string; expr: string; label: string; hint: string }
  | {
      kind: "long-running";
      app: string;
      binding: string;
      label: string;
      hint: string;
    };

/** One row of the picker: a heading the cursor skips, or a job. */
export interface PickerRow {
  value: string;
  label: string;
  hint: string;
  disabled?: boolean;
}

/**
 * The picker's rows: each kind's heading, then its jobs, indented under it.
 *
 * A heading is a disabled option (clack's cursor skips those), carrying its
 * description as the hint. A kind with no jobs draws no heading. Values are
 * indexes into `picks`, so a heading can never be returned as a choice.
 */
export function pickerRows(picks: readonly JobPick[]): PickerRow[] {
  return JOB_KINDS.flatMap((kind) => {
    const rows = picks.flatMap((pick, index) =>
      pick.kind === kind
        ? [
            {
              value: String(index),
              label: `  ${pick.app} · ${pick.label}`,
              hint: pick.hint,
            },
          ]
        : [],
    );
    if (rows.length === 0) return [];
    const heading = KIND_HEADINGS[kind];
    return [
      {
        value: `heading:${kind}`,
        label: heading.title,
        hint: heading.description,
        disabled: true,
      },
      ...rows,
    ];
  });
}

/** `0 0 * * * · daily at midnight UTC`, or just the expression it has no words for. */
function scheduleText(expr: string): string {
  const words = describeExpr(expr);
  return words === expr ? expr : `${expr} · ${words}`;
}

/** A Workflow's schedules, or "on demand" when nothing schedules it. */
function scheduleHint(schedules: readonly string[] | undefined): string {
  return schedules && schedules.length > 0
    ? schedules.map(scheduleText).join(", ")
    : "on demand";
}

/**
 * Every job the picker offers for `kinds`, read from `tier`'s configuration.
 *
 * Only for drawing the list: the tier the job then runs on is asked after, and
 * the chosen job is looked up again there.
 */
async function discoverPicks(
  kinds: readonly JobKind[],
  tier: CronTier,
  app: string | undefined,
): Promise<JobPick[]> {
  const configs = discoverWranglerConfigs();
  // Read for the long-running half too: `WORKFLOW_CRONS` says in words what
  // a Workflow does, where its wrangler name only says where it runs.
  const maps = await discoverCronMaps();
  const picks: JobPick[] = [];

  if (kinds.includes("sync")) {
    const byApp = new Map(
      configs.map(({ app: name, config }) => [name, config]),
    );
    for (const choice of cronChoices(maps, byApp, tier, app)) {
      picks.push({
        kind: "sync",
        app: choice.app,
        expr: choice.expr,
        label: choice.label,
        hint: choice.scheduled
          ? scheduleText(choice.expr)
          : `${choice.expr} · manual only on ${tier}`,
      });
    }
  }

  if (kinds.includes("long-running")) {
    for (const choice of workflowChoices(configs, [tier])) {
      if (app && choice.app !== app) continue;
      const described = Object.values(
        maps.find((map) => map.app === choice.app)?.workflows ?? {},
      ).find((entry) => entry.binding === choice.binding);
      picks.push({
        kind: "long-running",
        app: choice.app,
        binding: choice.binding,
        label: described?.label ?? choice.name,
        hint: scheduleHint(choice.schedules),
      });
    }
  }

  return picks;
}

/** The tier whose configuration the picker reads before the run asks for one. */
function displayTier(given: string | undefined): CronTier {
  if (given && isCronTier(given)) return given;
  const entered = process.env.DEPLOY_ENV;
  return entered && isCronTier(entered) ? entered : "development";
}

async function runJobsRun(argv: readonly string[]): Promise<number> {
  const kinds = kindsOf(argv, "run");
  if (!kinds) return 1;

  const cron = flagValue([...argv], "--cron");
  const workflow = flagValue([...argv], "--workflow");
  const route = positionals(argv)[0];

  if (cron && workflow) {
    process.stderr.write(
      "devtools jobs run: --cron runs a quick sync and --workflow a " +
        "long-running job; pass one.\n",
    );
    return 1;
  }
  if ((cron || route) && !kinds.includes("sync")) {
    process.stderr.write(
      "devtools jobs run: --cron runs a quick sync, not a long-running job.\n",
    );
    return 1;
  }
  if (workflow && !kinds.includes("long-running")) {
    process.stderr.write(
      "devtools jobs run: --workflow runs a long-running job, not a quick sync.\n",
    );
    return 1;
  }

  if (cron || route) return runCronRun(argv);
  if (workflow) return runWorkflowsRun(argv);

  if (!process.stdin.isTTY) {
    process.stderr.write(
      "devtools jobs run: pass --cron <expr> or --workflow <name> (and --app " +
        "when needed) when no terminal is available.\n",
    );
    return 1;
  }

  const app = flagValue([...argv], "--app");
  const picks = await discoverPicks(
    kinds,
    displayTier(flagValue([...argv], "--tier")),
    app,
  );
  if (picks.length === 0) {
    process.stderr.write(
      `devtools jobs run: no ${kinds.length === 1 ? `${KIND_HEADINGS[kinds[0]!].title.toLowerCase()} ` : "jobs "}were discovered${app ? ` for ${app}` : ""}.\n`,
    );
    return 1;
  }

  const index = unwrap(
    await select<string>({
      message: "Which job should run?",
      options: pickerRows(picks),
    }),
  );
  const pick = picks[Number(index)];
  if (!pick) return 1; // a heading; the cursor skips them, so not reachable

  // The picker decided these, so they are what the "run it directly next
  // time" line needs. Passed on as flags too, which keeps the runners below
  // from asking again or recording them a second time.
  if (app === undefined) recordResolved("--app", pick.app);
  if (pick.kind === "sync") {
    recordResolved("--cron", pick.expr);
    return runCronRun([...argv, "--app", pick.app, "--cron", pick.expr]);
  }
  recordResolved("--workflow", pick.binding);
  return runWorkflowsRun([
    ...argv,
    "--app",
    pick.app,
    "--workflow",
    pick.binding,
  ]);
}

// ── list ─────────────────────────────────────────────────────────────────────

/** One row of `jobs list`, and one element of its `--json` array. */
export type JobRow =
  | {
      kind: "sync";
      app: string;
      tier: CronTier;
      schedule: string;
      human: string;
      label: string;
      routes: string[];
      status: "ok" | "never-fires" | "fires-nothing";
    }
  | {
      kind: "long-running";
      app: string;
      tier: CronTier;
      /** `null` for a Workflow nothing schedules: it runs on demand. */
      schedule: string | null;
      human: string;
      label: string;
      binding: string;
      workflowName?: string;
      className?: string;
      status: "ok" | "never-fires" | "misconfigured";
    };

/**
 * Every job across `kinds`, `tiers` and (optionally) one app.
 *
 * Syncs come from reconciling each app's `CRON_ROUTES` against its Worker
 * crons. Long-running jobs are the Workflow bindings, one row per native
 * schedule (or one "on demand" row), plus the app's `WORKFLOW_CRONS` labels:
 * one that matches a binding's schedule just lends that row its label, and
 * one that does not (a tier that never schedules it) is kept as its own row,
 * because its status is the warning, and stands in for the binding's "on
 * demand" row.
 */
export async function collectJobs(options: {
  kinds: readonly JobKind[];
  tiers: readonly CronTier[];
  app?: string;
}): Promise<JobRow[]> {
  const { kinds, tiers, app } = options;
  const configs = discoverWranglerConfigs().filter(
    (config) => !app || config.app === app,
  );
  // `WORKFLOW_CRONS` lives in scheduled.ts beside the syncs, so a
  // long-running-only listing reads it too.
  const maps = (await discoverCronMaps()).filter(
    (map) => !app || map.app === app,
  );
  const byApp = new Map(configs.map(({ app: name, config }) => [name, config]));
  const reconciled = maps.flatMap((map) => {
    const config = byApp.get(map.app);
    if (!config) throw new Error(`${map.app}: wrangler.jsonc is missing`);
    return reconcileMap(map, config, tiers);
  });

  const rows: JobRow[] = [];

  if (kinds.includes("sync")) {
    for (const row of reconciled) {
      if (row.kind !== "route" || row.status === "misconfigured") continue;
      rows.push({
        kind: "sync",
        app: row.app,
        tier: row.tier,
        schedule: row.expr,
        human: row.human,
        label: row.label,
        routes: row.routes,
        status: row.status,
      });
    }
  }

  if (kinds.includes("long-running")) {
    const longRunning: Extract<JobRow, { kind: "long-running" }>[] = [];
    for (const choice of workflowChoices(configs, tiers)) {
      const schedules =
        choice.schedules && choice.schedules.length > 0
          ? choice.schedules
          : [null];
      for (const schedule of schedules) {
        longRunning.push({
          kind: "long-running",
          app: choice.app,
          tier: choice.tier,
          schedule,
          human: schedule === null ? "on demand" : describeExpr(schedule),
          label: choice.name,
          binding: choice.binding,
          workflowName: choice.name,
          ...(choice.className ? { className: choice.className } : {}),
          status: "ok",
        });
      }
    }
    for (const row of reconciled) {
      if (row.kind !== "workflow" || row.status === "fires-nothing") continue;
      const same = longRunning.find(
        (candidate) =>
          candidate.app === row.app &&
          candidate.tier === row.tier &&
          candidate.binding === row.binding &&
          candidate.schedule === row.expr,
      );
      if (same && row.status === "ok") {
        same.label = row.label;
        continue;
      }
      longRunning.push({
        kind: "long-running",
        app: row.app,
        tier: row.tier,
        schedule: row.expr,
        human: row.human,
        label: row.label,
        binding: row.binding ?? "",
        ...(row.workflowName ? { workflowName: row.workflowName } : {}),
        status: row.status,
      });
    }
    // A `WORKFLOW_CRONS` entry names its binding, so the binding's own "on demand"
    // row would describe the same Workflow twice in a tier that does not
    // schedule it natively.
    const covered = new Set(
      reconciled.flatMap((row) =>
        row.kind === "workflow"
          ? [`${row.app} ${row.tier} ${row.binding}`]
          : [],
      ),
    );
    rows.push(
      ...longRunning
        .filter(
          (row) =>
            row.schedule !== null ||
            !covered.has(`${row.app} ${row.tier} ${row.binding}`),
        )
        .sort(
          (a, b) =>
            a.app.localeCompare(b.app) ||
            CRON_TIERS.indexOf(a.tier) - CRON_TIERS.indexOf(b.tier) ||
            a.label.localeCompare(b.label),
        ),
    );
  }

  return rows;
}

function warningFor(row: JobRow): string {
  switch (row.status) {
    case "ok":
      return "";
    case "never-fires":
      return "  ⚠  never fires (no wrangler schedule)";
    case "fires-nothing":
      return "  ⚠  fires nothing (no CRON_ROUTES or WORKFLOW_CRONS entry)";
    case "misconfigured":
      return row.kind === "long-running"
        ? `  ⚠  misconfigured (no "${row.binding}" workflow bound in this tier)`
        : "";
    default: {
      const _exhaustive: never = row;
      return _exhaustive;
    }
  }
}

/**
 * The text form: a heading and description per kind, then each app and tier
 * with its jobs as `schedule  when  label` lines. Routes and bindings sit
 * under their job, since the audit is the reason to run this.
 */
export function renderJobs(
  rows: readonly JobRow[],
  kinds: readonly JobKind[],
): string {
  const lines: string[] = [];
  for (const kind of kinds) {
    const heading = KIND_HEADINGS[kind];
    lines.push(`${heading.title}`, `  ${heading.description}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    if (ofKind.length === 0) lines.push("", "  (none found)");

    let block = "";
    for (const row of ofKind) {
      const at = `${row.app}  [${row.tier}]`;
      if (at !== block) {
        block = at;
        lines.push("", `  ${at}`);
      }
      const schedule = row.schedule ?? "on demand";
      const when = row.schedule === null ? "" : row.human;
      lines.push(
        `    ${schedule.padEnd(14)}  ${when.padEnd(24)}  ${row.label}${warningFor(row)}`.trimEnd(),
      );
      if (row.kind === "sync") {
        for (const route of row.routes) lines.push(`      ${route}`);
      } else {
        const named =
          row.workflowName && row.workflowName !== row.label
            ? ` (${row.workflowName})`
            : "";
        const className = row.className ? ` · class: ${row.className}` : "";
        lines.push(`      binding: ${row.binding}${named}${className}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function runJobsList(argv: readonly string[]): Promise<number> {
  const kinds = kindsOf(argv, "list");
  if (!kinds) return 1;

  const tier = flagValue([...argv], "--tier");
  if (tier !== undefined && !isCronTier(tier)) {
    process.stderr.write(
      `devtools jobs list: unknown tier "${tier}". Expected: ${CRON_TIERS.join(", ")}.\n`,
    );
    return 1;
  }
  const app = flagValue([...argv], "--app");

  const rows = await collectJobs({
    kinds,
    tiers: tier ? [tier] : CRON_TIERS,
    ...(app ? { app } : {}),
  });

  if (app && rows.length === 0) {
    process.stderr.write(
      `devtools jobs list: no jobs found for app "${app}".\n`,
    );
    return 1;
  }

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(renderJobs(rows, kinds));
  return 0;
}

// ── dispatch ─────────────────────────────────────────────────────────────────

export async function runJobs(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "run") return runJobsRun(rest);
  if (sub === "list") return runJobsList(rest);
  // A Workflow runtime, whichever name asked for it; `--kind` means nothing
  // to it, so `cron serve` serves Workflows like `jobs serve` does.
  if (sub === "serve") return runWorkflowsServe(rest);
  process.stderr.write(
    `devtools jobs: unknown subcommand "${sub ?? "(none)"}". Expected: run, list or serve.\n`,
  );
  return 1;
}

export const handleJobs: CommandHandler = async (rest) => {
  const code = await runJobs(rest);
  process.exitCode = code;
  return code === 0 ? DONE : null;
};
