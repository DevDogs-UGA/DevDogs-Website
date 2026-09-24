/**
 * The shapes this reconciler reads and writes — TASK-342's `devtools github
 * settings`, sibling of `../rulesets/types.ts`.
 *
 * Same reasoning as that file's header: a narrower slice of GitHub's REST
 * responses than Octokit's generated types, because devtools has no Octokit
 * dependency (every GitHub call goes through the `gh` CLI — see
 * `../client.ts`'s header). Only the fields this reconciler actually reads
 * or writes are represented.
 */

export type SecretScanningStatus = "enabled" | "disabled";

export interface LiveSecurityAndAnalysisField {
  status: SecretScanningStatus;
}

/**
 * `GET /repos/{owner}/{repo}`'s `security_and_analysis` object.
 *
 * Every field is optional because GitHub omits a sub-feature entirely when
 * it is not available on the repository's plan — `secret_scanning_
 * non_provider_patterns` and `secret_scanning_validity_checks` in particular
 * are Advanced-Security features GitHub grants free on PUBLIC repos, but an
 * absent key (not a `"disabled"` status) is how a private repo or a plan
 * without them reports "not offered here". `diff.ts` reads that absence as
 * `"unsupported"`, never as drift.
 */
export interface LiveSecurityAndAnalysis {
  secret_scanning?: LiveSecurityAndAnalysisField;
  secret_scanning_push_protection?: LiveSecurityAndAnalysisField;
  secret_scanning_non_provider_patterns?: LiveSecurityAndAnalysisField;
  secret_scanning_validity_checks?: LiveSecurityAndAnalysisField;
}

/** The slice of `GET /repos/{owner}/{repo}` this reconciler reads. */
export interface LiveRepo {
  private: boolean;
  /** `null` on a repo where security-and-analysis has never been touched. */
  security_and_analysis: LiveSecurityAndAnalysis | null;
}

/** `GET`/`PUT /repos/{owner}/{repo}/automated-security-fixes` — Dependabot security updates. */
export interface LiveAutomatedSecurityFixes {
  enabled: boolean;
  paused?: boolean;
}

/** `GET`/`PUT /repos/{owner}/{repo}/actions/permissions`. */
export interface LiveActionsPermissions {
  enabled: boolean;
  allowed_actions?: "all" | "local_only" | "selected";
  selected_actions_url?: string;
  /**
   * "Require actions to be pinned to a full-length commit SHA" — the field
   * this reconciler exists to set, gated on every `uses:` in the repo's own
   * workflows already being pinned (see `workflows.ts`).
   */
  sha_pinning_required?: boolean;
}

/** `GET`/`PUT /repos/{owner}/{repo}/actions/permissions/selected-actions`. */
export interface LiveSelectedActions {
  github_owned_allowed: boolean;
  verified_allowed: boolean;
  patterns_allowed: string[];
}

/** `GET`/`PUT /repos/{owner}/{repo}/actions/permissions/workflow`. */
export interface LiveWorkflowPermissions {
  default_workflow_permissions: "read" | "write";
  can_approve_pull_request_reviews: boolean;
}

/** One entry of an environment's `deployment_branch_policy`. */
export interface LiveDeploymentBranchPolicy {
  protected_branches: boolean;
  custom_branch_policies: boolean;
}

export interface LiveEnvironmentReviewer {
  type: string;
  reviewer?: { id: number; type?: string };
}

export interface LiveProtectionRule {
  type: string;
  reviewers?: LiveEnvironmentReviewer[];
}

/** `GET /repos/{owner}/{repo}/environments/{name}`. */
export interface LiveEnvironment {
  name: string;
  protection_rules?: LiveProtectionRule[];
  deployment_branch_policy: LiveDeploymentBranchPolicy | null;
}

/** One entry of `GET /repos/{owner}/{repo}/environments/{name}/deployment-branch-policies`. */
export interface LiveBranchPolicy {
  id: number;
  name: string;
}
