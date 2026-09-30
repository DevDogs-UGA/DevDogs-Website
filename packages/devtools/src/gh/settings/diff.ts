/**
 * Live settings snapshot -> a plan of per-setting checks, against
 * `desired.ts`'s desired shape.
 *
 * Unlike `../rulesets/diff.ts` (one shape, N instances), TASK-342's settings
 * are N unrelated resources on one repository — security-and-analysis,
 * Dependabot, three Actions endpoints, and three environments' branch
 * policies. So the plan here is a flat list of named checks, each its own
 * `ok` / `drift` / `unsupported` verdict, rather than create/update/delete
 * buckets. `fixable` marks which drifted checks `commands.ts`'s `--apply`
 * step is allowed to write — `false` for anything this reconciler must only
 * ever report: a missing environment (nothing here creates one), and a
 * missing required reviewer (nothing here invents one).
 */
import type { DesiredEnvironmentPolicy, DesiredSettings } from "./desired.js";
import type {
  LiveActionsPermissions,
  LiveAutomatedSecurityFixes,
  LiveBranchPolicy,
  LiveEnvironment,
  LiveRepo,
  LiveSecurityAndAnalysis,
  LiveSelectedActions,
  LiveWorkflowPermissions,
} from "./types.js";
import type { ActionUse } from "./workflows.js";

export type CheckStatus = "ok" | "drift" | "unsupported";

export interface SettingCheck {
  key: string;
  description: string;
  desired: string;
  live: string;
  status: CheckStatus;
  /** Whether `commands.ts`'s apply step may write this check's fix. */
  fixable: boolean;
}

export interface LiveEnvironmentSnapshot {
  environment: LiveEnvironment | null;
  branchPolicies: LiveBranchPolicy[];
}

export interface LiveSettingsSnapshot {
  repo: LiveRepo;
  vulnerabilityAlerts: boolean;
  automatedSecurityFixes: LiveAutomatedSecurityFixes;
  actionsPermissions: LiveActionsPermissions;
  selectedActions: LiveSelectedActions;
  workflowPermissions: LiveWorkflowPermissions;
  environments: Record<
    DesiredEnvironmentPolicy["name"],
    LiveEnvironmentSnapshot
  >;
}

export interface SettingsPlan {
  checks: SettingCheck[];
  unpinnedActions: readonly ActionUse[];
  /** Whether `sha_pinning_required` was refused this run because the repo's own workflows carry an unpinned `uses:`. */
  refuseShaPinning: boolean;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function secretScanningCheck(
  key: string,
  apiField: keyof LiveSecurityAndAnalysis,
  description: string,
  desiredEnabled: boolean,
  sa: LiveSecurityAndAnalysis | null,
): SettingCheck {
  const field = sa?.[apiField];
  if (sa === null || field === undefined) {
    return {
      key,
      description,
      desired: desiredEnabled ? "enabled" : "disabled",
      live: "unsupported on this repo",
      status: "unsupported",
      fixable: false,
    };
  }
  const enabled = field.status === "enabled";
  return {
    key,
    description,
    desired: desiredEnabled ? "enabled" : "disabled",
    live: enabled ? "enabled" : "disabled",
    status: enabled === desiredEnabled ? "ok" : "drift",
    fixable: true,
  };
}

/**
 * Builds the plan. `unpinnedActions` comes from `workflows.ts` — passed in
 * rather than recomputed here so this stays a pure function over data
 * `commands.ts` already gathered (and so `diff.test.ts` can assert
 * `refuseShaPinning` with a plain fixture array, no filesystem involved).
 */
export function planSettings(
  desired: DesiredSettings,
  live: LiveSettingsSnapshot,
  unpinnedActions: readonly ActionUse[],
): SettingsPlan {
  const checks: SettingCheck[] = [];
  const sa = live.repo.security_and_analysis;

  checks.push(
    secretScanningCheck(
      "security_and_analysis.secret_scanning",
      "secret_scanning",
      "Secret scanning",
      desired.securityAndAnalysis.secretScanning,
      sa,
    ),
    secretScanningCheck(
      "security_and_analysis.secret_scanning_push_protection",
      "secret_scanning_push_protection",
      "Secret scanning push protection",
      desired.securityAndAnalysis.secretScanningPushProtection,
      sa,
    ),
    secretScanningCheck(
      "security_and_analysis.secret_scanning_non_provider_patterns",
      "secret_scanning_non_provider_patterns",
      "Secret scanning non-provider patterns",
      desired.securityAndAnalysis.secretScanningNonProviderPatterns,
      sa,
    ),
    secretScanningCheck(
      "security_and_analysis.secret_scanning_validity_checks",
      "secret_scanning_validity_checks",
      "Secret scanning validity checks",
      desired.securityAndAnalysis.secretScanningValidityChecks,
      sa,
    ),
  );

  checks.push({
    key: "vulnerability_alerts",
    description: "Dependabot alerts",
    desired: desired.vulnerabilityAlerts ? "enabled" : "disabled",
    live: live.vulnerabilityAlerts ? "enabled" : "disabled",
    status:
      live.vulnerabilityAlerts === desired.vulnerabilityAlerts ? "ok" : "drift",
    fixable: true,
  });

  checks.push({
    key: "dependabot_security_updates",
    description: "Dependabot security updates",
    desired: desired.dependabotSecurityUpdates ? "enabled" : "disabled",
    live: live.automatedSecurityFixes.enabled ? "enabled" : "disabled",
    status:
      live.automatedSecurityFixes.enabled === desired.dependabotSecurityUpdates
        ? "ok"
        : "drift",
    fixable: true,
  });

  const refuseShaPinning = unpinnedActions.length > 0;
  const curShaPinning = live.actionsPermissions.sha_pinning_required === true;
  checks.push({
    key: "actions.sha_pinning_required",
    description: "Require actions to be pinned to a full-length SHA",
    desired: refuseShaPinning
      ? `true (REFUSED — ${unpinnedActions.length} unpinned uses: found)`
      : "true",
    live: curShaPinning ? "true" : "false",
    status: refuseShaPinning
      ? "unsupported"
      : curShaPinning === desired.actions.shaPinningRequired
        ? "ok"
        : "drift",
    fixable: !refuseShaPinning,
  });

  checks.push({
    key: "actions.allowed_actions",
    description: "Allowed actions",
    desired: desired.actions.allowedActions,
    live: live.actionsPermissions.allowed_actions ?? "(unset)",
    status:
      live.actionsPermissions.allowed_actions === desired.actions.allowedActions
        ? "ok"
        : "drift",
    fixable: true,
  });

  const patternsMatch =
    live.selectedActions.github_owned_allowed ===
      desired.actions.githubOwnedAllowed &&
    live.selectedActions.verified_allowed === desired.actions.verifiedAllowed &&
    sameSet(live.selectedActions.patterns_allowed, desired.actions.patterns);
  checks.push({
    key: "actions.selected_actions",
    description:
      "Selected-actions allowlist (github-owned, verified, patterns)",
    desired: `github_owned=${desired.actions.githubOwnedAllowed}, verified=${desired.actions.verifiedAllowed}, patterns=[${[...desired.actions.patterns].sort().join(", ")}]`,
    live: `github_owned=${live.selectedActions.github_owned_allowed}, verified=${live.selectedActions.verified_allowed}, patterns=[${[...live.selectedActions.patterns_allowed].sort().join(", ")}]`,
    status: patternsMatch ? "ok" : "drift",
    fixable: true,
  });

  const workflowPermissionsMatch =
    live.workflowPermissions.default_workflow_permissions ===
      desired.workflowPermissions.defaultWorkflowPermissions &&
    live.workflowPermissions.can_approve_pull_request_reviews ===
      desired.workflowPermissions.canApprovePullRequestReviews;
  checks.push({
    key: "actions.workflow_permissions",
    description: "Default workflow permissions",
    desired: `${desired.workflowPermissions.defaultWorkflowPermissions}, can_approve_pull_request_reviews=${desired.workflowPermissions.canApprovePullRequestReviews}`,
    live: `${live.workflowPermissions.default_workflow_permissions}, can_approve_pull_request_reviews=${live.workflowPermissions.can_approve_pull_request_reviews}`,
    status: workflowPermissionsMatch ? "ok" : "drift",
    fixable: true,
  });

  for (const env of desired.environments) {
    const snapshot = live.environments[env.name];
    if (!snapshot.environment) {
      checks.push({
        key: `environments.${env.name}`,
        description: `Environment "${env.name}"`,
        desired: `branches=[${env.allowedBranches.join(", ")}], reviewers=${env.requireReviewers}`,
        live: "environment does not exist",
        status: "unsupported",
        fixable: false,
      });
      continue;
    }

    const liveBranches = snapshot.branchPolicies.map((p) => p.name);
    const branchesMatch =
      snapshot.environment.deployment_branch_policy?.custom_branch_policies ===
        true &&
      snapshot.environment.deployment_branch_policy?.protected_branches ===
        false &&
      sameSet(liveBranches, env.allowedBranches);
    checks.push({
      key: `environments.${env.name}.branch_policy`,
      description: `Environment "${env.name}" deployment branch policy`,
      desired: [...env.allowedBranches].sort().join(", "),
      live: snapshot.environment.deployment_branch_policy
        ? [...liveBranches].sort().join(", ") ||
          "(no branch restriction — all branches allowed)"
        : "(no deployment branch policy configured)",
      status: branchesMatch ? "ok" : "drift",
      fixable: true,
    });

    if (env.requireReviewers) {
      const hasReviewers = (snapshot.environment.protection_rules ?? []).some(
        (rule) =>
          rule.type === "required_reviewers" &&
          (rule.reviewers?.length ?? 0) > 0,
      );
      checks.push({
        key: `environments.${env.name}.required_reviewers`,
        description: `Environment "${env.name}" required reviewers`,
        desired: "at least one reviewer configured",
        live: hasReviewers ? "configured" : "none configured",
        status: hasReviewers ? "ok" : "drift",
        // Never auto-fixable — this reconciler does not invent reviewers.
        fixable: false,
      });
    }
  }

  return { checks, unpinnedActions, refuseShaPinning };
}

/** Whether a plan has any FIXABLE drift `--apply` would write. */
export function planHasFixableChanges(plan: SettingsPlan): boolean {
  return plan.checks.some((c) => c.status === "drift" && c.fixable);
}

/** Whether a plan reports any drift at all, fixable or not (for exit-code / `--check` style callers). */
export function planHasChanges(plan: SettingsPlan): boolean {
  return plan.checks.some((c) => c.status === "drift");
}
