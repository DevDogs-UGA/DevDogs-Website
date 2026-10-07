/**
 * What TASK-342's `backstage github settings` wants DevDogsUGA/DevDogsUGA's
 * repository settings to look like.
 *
 * Sibling of `../rulesets/desired.ts` — same shape of module (a pure
 * builder, no network, so `desired.test.ts` can assert it directly) covering
 * a different slice of repository configuration: security-and-analysis,
 * Dependabot, Actions permissions, and the four deploy environments'
 * branch policies. `diff.ts` compares this against what `api.ts`'s reads
 * report; `commands.ts` is the `backstage github settings` command that
 * prints or applies the difference.
 */
export type SettingsEnvironment = string;

/** Repositories this reconciler carries a desired state for. */
export const MANAGED_REPOS = ["DevDogsUGA", "Backstage"] as const;
export type ManagedRepo = (typeof MANAGED_REPOS)[number];

export function isManagedRepo(repo: string): repo is ManagedRepo {
  return (MANAGED_REPOS as readonly string[]).includes(repo);
}

export interface DesiredEnvironmentPolicy {
  name: SettingsEnvironment;
  /**
   * Deployment-branch-policy names this environment allows. Exact branch
   * names, or a glob pattern (GitHub stores both as `type: branch` policies;
   * `*` does not match `/`, so the merge queue's
   * `gh-readonly-queue/main/pr-N-<sha>` needs `gh-readonly-queue/main/*`).
   */
  allowedBranches: readonly string[];
  /**
   * Whether `--apply` may CREATE this environment when it does not exist.
   * Off for DevDogsUGA (its environment is reported only, as always).
   * When on, the environment is created with its branch policies AND — the
   * one place reviewers are ever written — `reviewerTeams` plus
   * `preventSelfReview`. An environment that already exists never has its
   * reviewers touched: those stay report-only.
   */
  createIfMissing?: boolean;
  /** Org team slugs set as required reviewers when this environment is created. */
  reviewerTeams?: readonly string[];
  /** Whether this environment must carry at least one required reviewer (never auto-added — see `diff.ts`). */
  requireReviewers: boolean;
  /**
   * Whether the reviewer rule must also set `prevent_self_review`, so the
   * person who triggered a deploy cannot approve it. Never auto-added.
   */
  preventSelfReview: boolean;
}

export interface DesiredSettings {
  securityAndAnalysis: {
    secretScanning: boolean;
    secretScanningPushProtection: boolean;
    /** Advanced-Security features GitHub grants free on PUBLIC repos; `diff.ts` treats an absent live field as "unsupported", never as drift. */
    secretScanningNonProviderPatterns: boolean;
    secretScanningValidityChecks: boolean;
  };
  vulnerabilityAlerts: boolean;
  dependabotSecurityUpdates: boolean;
  actions: {
    /** Gated on every workflow `uses:` already being SHA-pinned — see `workflows.ts` and `diff.ts`'s `refuseShaPinning`. */
    shaPinningRequired: boolean;
    allowedActions: "selected";
    githubOwnedAllowed: boolean;
    verifiedAllowed: boolean;
    /** `owner/repo@*`, computed from the repo's own workflows by `workflows.ts#computeActionPatterns`. */
    patterns: readonly string[];
  };
  workflowPermissions: {
    defaultWorkflowPermissions: "read";
    canApprovePullRequestReviews: false;
  };
  environments: readonly DesiredEnvironmentPolicy[];
}

/**
 * Builds the desired settings. `actionPatterns` comes from scanning the
 * repo's own workflow files (`workflows.ts#computeActionPatterns`) —
 * `commands.ts` is the only real caller, and passes the live scan result
 * rather than this module reading the filesystem itself, so `desired.test.ts`
 * can assert the shape with a fixture list and no repo on disk.
 */
export function buildDesiredSettings(
  actionPatterns: readonly string[],
  repo: ManagedRepo = "DevDogsUGA",
): DesiredSettings {
  return {
    ...baseSettings(actionPatterns),
    environments:
      repo === "Backstage" ? BACKSTAGE_ENVIRONMENTS : DEVDOGSUGA_ENVIRONMENTS,
  };
}

const plain = (
  name: string,
  allowedBranches: readonly string[] = ["main"],
): DesiredEnvironmentPolicy => ({
  name,
  allowedBranches,
  requireReviewers: false,
  preventSelfReview: false,
});

/** `staging-build`/`production-build` also run for the merge queue's temporary branches. */
const MAIN_AND_QUEUE = ["main", "gh-readonly-queue/main/*"] as const;

/**
 * Backstage: `publishing` is the manual-approval gate for npm publishes
 * (what is live today: reviewer team `devops`, self-review prevented, `main`
 * only). The `*-build` environments hold public variables only and also run
 * on merge-queue branches. Created on `--apply` when missing.
 */
const BACKSTAGE_ENVIRONMENTS: readonly DesiredEnvironmentPolicy[] = [
  {
    name: "publishing",
    allowedBranches: ["main"],
    requireReviewers: true,
    preventSelfReview: true,
    createIfMissing: true,
    reviewerTeams: ["devops"],
  },
  { ...plain("staging"), createIfMissing: true },
  { ...plain("preflight"), createIfMissing: true },
  { ...plain("staging-build", MAIN_AND_QUEUE), createIfMissing: true },
  { ...plain("production-build", MAIN_AND_QUEUE), createIfMissing: true },
  {
    name: "production",
    allowedBranches: ["main"],
    requireReviewers: true,
    preventSelfReview: true,
    createIfMissing: true,
    reviewerTeams: ["devops"],
  },
];

/**
 * DevDogsUGA after Phase 3 of TASK-478: Backstage owns deployment, so the
 * only environment left is `deploy-pr`, which holds the deploy-PR App's
 * credential for the `open-deploy-pr` job and is restricted to `main`. The old
 * `preflight`, `staging`, `production-build` and `production` environments
 * are no longer managed (and may be deleted by hand once the flip is done).
 * Report-only: `--apply` never creates it, since it carries secrets.
 */
const DEVDOGSUGA_ENVIRONMENTS: readonly DesiredEnvironmentPolicy[] = [
  plain("deploy-pr"),
];

function baseSettings(
  actionPatterns: readonly string[],
): Omit<DesiredSettings, "environments"> {
  return {
    securityAndAnalysis: {
      secretScanning: true,
      secretScanningPushProtection: true,
      secretScanningNonProviderPatterns: true,
      secretScanningValidityChecks: true,
    },
    vulnerabilityAlerts: true,
    dependabotSecurityUpdates: true,
    actions: {
      shaPinningRequired: true,
      allowedActions: "selected",
      githubOwnedAllowed: true,
      verifiedAllowed: true,
      patterns: [...actionPatterns].sort(),
    },
    workflowPermissions: {
      defaultWorkflowPermissions: "read",
      canApprovePullRequestReviews: false,
    },
  };
}
