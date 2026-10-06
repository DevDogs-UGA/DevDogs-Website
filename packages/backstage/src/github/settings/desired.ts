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
export type SettingsEnvironment =
  "preflight" | "staging" | "production-build" | "production";

export interface DesiredEnvironmentPolicy {
  name: SettingsEnvironment;
  /** Deployment-branch-policy patterns this environment allows — exact branch names here, not glob patterns. */
  allowedBranches: readonly string[];
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
): DesiredSettings {
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
    // `production` is THE reviewer gate: it holds every production secret,
    // including the apply-tier credential (`gh/environments.ts`). No other
    // environment may receive an apply-tier key, so none needs reviewers.
    // `production-build` holds public variables only and builds production
    // artifacts without credentials.
    environments: [
      {
        name: "preflight",
        allowedBranches: ["main"],
        requireReviewers: false,
        preventSelfReview: false,
      },
      {
        name: "staging",
        allowedBranches: ["main"],
        requireReviewers: false,
        preventSelfReview: false,
      },
      {
        name: "production-build",
        allowedBranches: ["main"],
        requireReviewers: false,
        preventSelfReview: false,
      },
      {
        name: "production",
        allowedBranches: ["main"],
        requireReviewers: true,
        preventSelfReview: true,
      },
    ],
  };
}
