/**
 * `devtools github rulesets` — TASK-322.
 *
 * Prints the diff between the five fixed rulesets DevDogsUGA's
 * `apps/platform/src/server/github/rulesets.ts` has always assumed exist
 * (`main`, `production`, `~ALL`, `team/**`, and the tag ruleset — see
 * `desired.ts`'s header) and what `gh api .../rulesets` actually reports.
 * Defaults to a dry-run plan; `--apply` writes it, gated behind a
 * confirmation unless `--yes`.
 *
 * Never touches a per-team ruleset (`teamRulesetName()`'s `team/<slug>`) —
 * those are `teamSync.ts`'s, not this command's — and never deletes or
 * creates anything outside `desired.ts`'s five names plus the one explicit
 * deletion (`comp-branches`). See `diff.ts`'s header for the full
 * classification.
 */
import { confirm } from "@clack/prompts";
import { resolveAppId, resolveTeamId } from "./actors.js";
import {
  createRuleset,
  deleteRuleset,
  getRuleset,
  listRulesets,
  updateRuleset,
  type Repo,
} from "./api.js";
import { buildDesiredRulesets, isPerTeamRulesetName } from "./desired.js";
import { planHasChanges, planRulesets, type RulesetPlan } from "./diff.js";
import type { LiveRuleset } from "./types.js";
import { unwrap } from "@devdogsuga/cli-core/ui";

const DEFAULT_ORG = "DevDogsUGA";
const DEFAULT_REPO = "DevDogsUGA";
const DEFAULT_APP_SLUG = "devdogs-platform";
const DEFAULT_DEVOPS_SLUG = "devops";
const DEFAULT_ADMINS_SLUG = "admins";
/** TASK-299 — installed separately from the platform App; may not exist yet. */
const DEFAULT_RENOVATE_SLUG = "renovate";

interface RulesetsOptions {
  org: string;
  repo: string;
  appSlug: string;
  apply: boolean;
  yes: boolean;
  json: boolean;
}

function parseOptions(argv: readonly string[]): RulesetsOptions {
  const opts: RulesetsOptions = {
    org: DEFAULT_ORG,
    repo: DEFAULT_REPO,
    appSlug: DEFAULT_APP_SLUG,
    apply: false,
    yes: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org") opts.org = argv[++i] ?? opts.org;
    else if (arg === "--repo") opts.repo = argv[++i] ?? opts.repo;
    else if (arg === "--app-slug") opts.appSlug = argv[++i] ?? opts.appSlug;
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

/**
 * Fetches full detail for every live ruleset EXCEPT per-team ones —
 * `diff.ts`'s `planRulesets` never reads past a per-team ruleset's name, and
 * there can be up to ~70 of them, so fetching each would be up to ~70 extra
 * GETs this reconciler has no use for.
 */
async function fetchDetails(
  r: Repo,
  summaries: readonly { id: number; name: string }[],
): Promise<Map<number, LiveRuleset>> {
  const details = new Map<number, LiveRuleset>();
  for (const s of summaries) {
    if (isPerTeamRulesetName(s.name)) continue;
    details.set(s.id, await getRuleset(r, s.id));
  }
  return details;
}

function renderRuleLine(rule: { type: string }): string {
  return rule.type;
}

function renderDesired(desired: {
  name: string;
  rules: readonly { type: string }[];
  bypass_actors: readonly {
    actor_id: number;
    actor_type: string;
    bypass_mode: string;
  }[];
}): string[] {
  return [
    `    rules:   ${desired.rules.map(renderRuleLine).join(", ")}`,
    `    bypass:  ${
      desired.bypass_actors.length === 0
        ? "(none)"
        : desired.bypass_actors
            .map((a) => `${a.actor_type}#${a.actor_id} (${a.bypass_mode})`)
            .join(", ")
    }`,
  ];
}

export function renderPlan(plan: RulesetPlan): string {
  const lines: string[] = [];

  for (const create of plan.creates) {
    lines.push(`+ create   "${create.desired.name}"`);
    lines.push(...renderDesired(create.desired));
  }
  for (const update of plan.updates) {
    const renameNote =
      update.liveName !== update.desired.name
        ? ` (renamed from "${update.liveName}")`
        : "";
    lines.push(
      `~ update   "${update.desired.name}"${renameNote} [id ${update.id}]`,
    );
    lines.push(...renderDesired(update.desired));
  }
  for (const del of plan.deletes) {
    lines.push(`- delete   "${del.name}" [id ${del.id}]`);
  }
  for (const noop of plan.noops) {
    lines.push(`= ok       "${noop.name}" [id ${noop.id}] — already matches`);
  }
  if (plan.perTeamSkipped.length > 0) {
    lines.push(
      `  skipped  ${plan.perTeamSkipped.length} per-team ruleset(s), owned by teamSync.ts: ` +
        plan.perTeamSkipped.join(", "),
    );
  }
  if (plan.unmanaged.length > 0) {
    lines.push(
      `  unmanaged  ${plan.unmanaged.join(", ")} — not a fixed ruleset or a deletion target, left alone`,
    );
  }
  if (lines.length === 0) return "(nothing to report)";
  return lines.join("\n");
}

async function confirmApply(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "devtools github rulesets: --yes is required to apply with no terminal available.\n",
    );
    return false;
  }
  return unwrap(
    await confirm({
      message: "Apply this ruleset plan?",
      initialValue: false,
    }),
  );
}

export async function runGithubRulesets(
  argv: readonly string[],
): Promise<number> {
  const opts = parseOptions(argv);
  const r: Repo = { owner: opts.org, repo: opts.repo };

  let devopsTeamId: number;
  let adminsTeamId: number;
  let appId: number;
  try {
    [devopsTeamId, adminsTeamId, appId] = await Promise.all([
      resolveTeamId(opts.org, DEFAULT_DEVOPS_SLUG),
      resolveTeamId(opts.org, DEFAULT_ADMINS_SLUG),
      resolveAppId(opts.org, opts.appSlug),
    ]);
  } catch (err) {
    process.stderr.write(
      `devtools github rulesets: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  // Renovate (TASK-299) is resolved SEPARATELY and is allowed to fail: Sloan
  // may not have installed it yet, and that must not block reconciling
  // everything else. A failure here prints a warning and the plan simply
  // omits it from `~ALL`'s bypass list — re-running after the App is
  // installed picks it up with no further action.
  let renovateAppId: number | undefined;
  try {
    renovateAppId = await resolveAppId(opts.org, DEFAULT_RENOVATE_SLUG);
  } catch (err) {
    process.stderr.write(
      `devtools github rulesets: warning: could not resolve the Renovate App ` +
        `("${DEFAULT_RENOVATE_SLUG}") — ~ALL's plan omits it as a bypass actor ` +
        `until it is installed (TASK-299). ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  const actors = { devopsTeamId, adminsTeamId, appId, renovateAppId };
  const desired = buildDesiredRulesets(actors);

  let summaries;
  let details;
  try {
    summaries = await listRulesets(r);
    details = await fetchDetails(r, summaries);
  } catch (err) {
    process.stderr.write(
      `devtools github rulesets: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const plan = planRulesets(summaries, details, actors, desired);

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }

  if (!opts.apply) {
    if (!opts.json && planHasChanges(plan)) {
      console.log("\n(dry run — pass --apply to write this plan)");
    }
    return 0;
  }

  if (!planHasChanges(plan)) return 0;

  if (!(await confirmApply(opts.yes))) return 1;

  try {
    for (const create of plan.creates) {
      await createRuleset(r, create.desired);
    }
    for (const update of plan.updates) {
      await updateRuleset(r, update.id, update.desired);
    }
    for (const del of plan.deletes) {
      await deleteRuleset(r, del.id);
    }
  } catch (err) {
    process.stderr.write(
      `devtools github rulesets: apply failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  console.log("Applied.");
  return 0;
}
