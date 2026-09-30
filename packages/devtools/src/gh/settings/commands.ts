/**
 * `devtools github settings` — TASK-342.
 *
 * Prints the diff between the repository settings DevDogsUGA/DevDogsUGA
 * must carry (secret scanning, Dependabot, Actions permissions and SHA
 * pinning, and the three deploy environments' branch policies) and what
 * `gh api` actually reports. Defaults to a dry-run plan; `--apply` writes
 * FIXABLE drift, gated behind a confirmation unless `--yes`. Sibling of
 * `../rulesets/commands.ts`, same flag shape (`--org`, `--repo`, `--apply`,
 * `--yes`, `--json`).
 *
 * Never invents a required reviewer, and never creates a missing
 * environment — both are reported only. See `../diff.ts`'s header for why.
 */
import { confirm } from "@clack/prompts";
import {
  addDeploymentBranchPolicy,
  deleteDeploymentBranchPolicy,
  getActionsPermissions,
  getAutomatedSecurityFixes,
  getDeploymentBranchPolicies,
  getEnvironment,
  getRepo,
  getSelectedActions,
  getVulnerabilityAlertsEnabled,
  getWorkflowPermissions,
  patchSecurityAndAnalysis,
  setActionsPermissions,
  setAutomatedSecurityFixesEnabled,
  setDeploymentBranchPolicyMode,
  setSelectedActions,
  setVulnerabilityAlertsEnabled,
  setWorkflowPermissions,
  type Repo,
} from "./api.js";
import { buildDesiredSettings, type DesiredSettings } from "./desired.js";
import {
  planHasFixableChanges,
  planSettings,
  type LiveSettingsSnapshot,
  type SettingsPlan,
} from "./diff.js";
import type { LiveSecurityAndAnalysis } from "./types.js";
import {
  collectActionUses,
  computeActionPatterns,
  unpinnedActionUses,
} from "./workflows.js";
import { findRepoRoot } from "../../repo/root.js";
import { unwrap } from "../../ui.js";

const DEFAULT_ORG = "DevDogsUGA";
const DEFAULT_REPO = "DevDogsUGA";

interface SettingsOptions {
  org: string;
  repo: string;
  apply: boolean;
  yes: boolean;
  json: boolean;
}

function parseOptions(argv: readonly string[]): SettingsOptions {
  const opts: SettingsOptions = {
    org: DEFAULT_ORG,
    repo: DEFAULT_REPO,
    apply: false,
    yes: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org") opts.org = argv[++i] ?? opts.org;
    else if (arg === "--repo") opts.repo = argv[++i] ?? opts.repo;
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

async function fetchSnapshot(r: Repo): Promise<LiveSettingsSnapshot> {
  const [
    repo,
    vulnerabilityAlerts,
    automatedSecurityFixes,
    actionsPermissions,
    selectedActions,
    workflowPermissions,
    staging,
    production,
    productionApply,
  ] = await Promise.all([
    getRepo(r),
    getVulnerabilityAlertsEnabled(r),
    getAutomatedSecurityFixes(r),
    getActionsPermissions(r),
    getSelectedActions(r),
    getWorkflowPermissions(r),
    fetchEnvironmentSnapshot(r, "staging"),
    fetchEnvironmentSnapshot(r, "production"),
    fetchEnvironmentSnapshot(r, "production-apply"),
  ]);

  return {
    repo,
    vulnerabilityAlerts,
    automatedSecurityFixes,
    actionsPermissions,
    selectedActions,
    workflowPermissions,
    environments: { staging, production, "production-apply": productionApply },
  };
}

async function fetchEnvironmentSnapshot(r: Repo, name: string) {
  const environment = await getEnvironment(r, name);
  if (!environment) return { environment: null, branchPolicies: [] };
  const branchPolicies = await getDeploymentBranchPolicies(r, name);
  return { environment, branchPolicies };
}

function renderPlan(plan: SettingsPlan): string {
  const lines: string[] = [];

  if (plan.unpinnedActions.length > 0) {
    lines.push(
      `! ${plan.unpinnedActions.length} workflow uses: not pinned to a 40-hex SHA — sha_pinning_required is REFUSED:`,
    );
    for (const use of plan.unpinnedActions) {
      lines.push(`    ${use.file}:${use.line}  uses: ${use.raw}`);
    }
  }

  for (const check of plan.checks) {
    const marker =
      check.status === "ok" ? "=" : check.status === "unsupported" ? "?" : "~";
    lines.push(`${marker} ${check.key}`);
    lines.push(`    desired: ${check.desired}`);
    lines.push(`    live:    ${check.live}`);
    if (check.status === "drift" && !check.fixable) {
      lines.push(`    (drift reported only — not auto-fixable)`);
    }
  }

  if (lines.length === 0) return "(nothing to report)";
  return lines.join("\n");
}

async function confirmApply(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "devtools github settings: --yes is required to apply with no terminal available.\n",
    );
    return false;
  }
  return unwrap(
    await confirm({
      message: "Apply this settings plan?",
      initialValue: false,
    }),
  );
}

/**
 * Writes every drifted, fixable check in `plan`. Grouped by the GitHub
 * endpoint each check's fix lands on, so two checks that share one PUT body
 * (`actions.sha_pinning_required` and `actions.allowed_actions`, both on
 * `PUT .../actions/permissions`) are written together, once.
 */
async function applyPlan(
  r: Repo,
  desired: DesiredSettings,
  live: LiveSettingsSnapshot,
  plan: SettingsPlan,
): Promise<void> {
  const drift = new Set(
    plan.checks
      .filter((c) => c.status === "drift" && c.fixable)
      .map((c) => c.key),
  );

  const secretScanningFields: Partial<LiveSecurityAndAnalysis> = {};
  if (drift.has("security_and_analysis.secret_scanning")) {
    secretScanningFields.secret_scanning = {
      status: desired.securityAndAnalysis.secretScanning
        ? "enabled"
        : "disabled",
    };
  }
  if (drift.has("security_and_analysis.secret_scanning_push_protection")) {
    secretScanningFields.secret_scanning_push_protection = {
      status: desired.securityAndAnalysis.secretScanningPushProtection
        ? "enabled"
        : "disabled",
    };
  }
  if (
    drift.has("security_and_analysis.secret_scanning_non_provider_patterns")
  ) {
    secretScanningFields.secret_scanning_non_provider_patterns = {
      status: desired.securityAndAnalysis.secretScanningNonProviderPatterns
        ? "enabled"
        : "disabled",
    };
  }
  if (drift.has("security_and_analysis.secret_scanning_validity_checks")) {
    secretScanningFields.secret_scanning_validity_checks = {
      status: desired.securityAndAnalysis.secretScanningValidityChecks
        ? "enabled"
        : "disabled",
    };
  }
  if (Object.keys(secretScanningFields).length > 0) {
    await patchSecurityAndAnalysis(r, secretScanningFields);
  }

  if (drift.has("vulnerability_alerts")) {
    await setVulnerabilityAlertsEnabled(r, desired.vulnerabilityAlerts);
  }

  if (drift.has("dependabot_security_updates")) {
    await setAutomatedSecurityFixesEnabled(
      r,
      desired.dependabotSecurityUpdates,
    );
  }

  if (
    drift.has("actions.sha_pinning_required") ||
    drift.has("actions.allowed_actions")
  ) {
    await setActionsPermissions(r, {
      enabled: live.actionsPermissions.enabled,
      allowed_actions: drift.has("actions.allowed_actions")
        ? desired.actions.allowedActions
        : live.actionsPermissions.allowed_actions,
      // Never written true unless THIS run's own check approved it —
      // `plan.refuseShaPinning` already kept it out of `drift` when refused,
      // but guarded again here so a future caller building `drift` some
      // other way cannot accidentally turn this on unsafely.
      sha_pinning_required: drift.has("actions.sha_pinning_required")
        ? desired.actions.shaPinningRequired
        : live.actionsPermissions.sha_pinning_required,
    });
  }

  if (drift.has("actions.selected_actions")) {
    await setSelectedActions(r, {
      github_owned_allowed: desired.actions.githubOwnedAllowed,
      verified_allowed: desired.actions.verifiedAllowed,
      patterns_allowed: [...desired.actions.patterns],
    });
  }

  if (drift.has("actions.workflow_permissions")) {
    await setWorkflowPermissions(r, {
      default_workflow_permissions:
        desired.workflowPermissions.defaultWorkflowPermissions,
      can_approve_pull_request_reviews:
        desired.workflowPermissions.canApprovePullRequestReviews,
    });
  }

  for (const env of desired.environments) {
    if (!drift.has(`environments.${env.name}.branch_policy`)) continue;

    await setDeploymentBranchPolicyMode(r, env.name, {
      protected_branches: false,
      custom_branch_policies: true,
    });
    const existing = await getDeploymentBranchPolicies(r, env.name);
    const wanted = new Set(env.allowedBranches);
    for (const policy of existing) {
      if (!wanted.has(policy.name))
        await deleteDeploymentBranchPolicy(r, env.name, policy.id);
    }
    const already = new Set(existing.map((p) => p.name));
    for (const branch of env.allowedBranches) {
      if (!already.has(branch))
        await addDeploymentBranchPolicy(r, env.name, branch);
    }
  }
}

export async function runGithubSettings(
  argv: readonly string[],
): Promise<number> {
  const opts = parseOptions(argv);
  const r: Repo = { owner: opts.org, repo: opts.repo };

  let uses;
  try {
    uses = collectActionUses(findRepoRoot());
  } catch (err) {
    process.stderr.write(
      `devtools github settings: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  const unpinned = unpinnedActionUses(uses);
  const patterns = computeActionPatterns(uses);
  const desired = buildDesiredSettings(patterns);

  let live: LiveSettingsSnapshot;
  try {
    live = await fetchSnapshot(r);
  } catch (err) {
    process.stderr.write(
      `devtools github settings: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const plan = planSettings(desired, live, unpinned);

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }

  if (!opts.apply) {
    if (!opts.json && planHasFixableChanges(plan)) {
      console.log("\n(dry run — pass --apply to write this plan)");
    }
    return 0;
  }

  if (!planHasFixableChanges(plan)) return 0;

  if (!(await confirmApply(opts.yes))) return 1;

  try {
    await applyPlan(r, desired, live, plan);
  } catch (err) {
    process.stderr.write(
      `devtools github settings: apply failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  console.log("Applied.");
  return 0;
}
