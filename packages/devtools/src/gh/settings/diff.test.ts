import { describe, expect, it } from "vitest";
import { buildDesiredSettings, type DesiredSettings } from "./desired.js";
import { planHasChanges, planHasFixableChanges, planSettings } from "./diff.js";
import type { ActionUse } from "./workflows.js";
import type { LiveSettingsSnapshot } from "./diff.js";

const PATTERNS = ["actions/checkout@*"];

function desiredFixture(): DesiredSettings {
  return buildDesiredSettings(PATTERNS);
}

/** A live snapshot that matches `desiredFixture()` exactly — the idempotence fixture. */
function matchingSnapshot(): LiveSettingsSnapshot {
  return {
    repo: {
      private: false,
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
        secret_scanning_non_provider_patterns: { status: "enabled" },
        secret_scanning_validity_checks: { status: "enabled" },
      },
    },
    vulnerabilityAlerts: true,
    automatedSecurityFixes: { enabled: true },
    actionsPermissions: {
      enabled: true,
      allowed_actions: "selected",
      sha_pinning_required: true,
    },
    selectedActions: {
      github_owned_allowed: true,
      verified_allowed: true,
      patterns_allowed: [...PATTERNS],
    },
    workflowPermissions: {
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: false,
    },
    environments: {
      staging: {
        environment: {
          name: "staging",
          protection_rules: [],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
        branchPolicies: [{ id: 1, name: "main" }],
      },
      production: {
        environment: {
          name: "production",
          protection_rules: [],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
        branchPolicies: [{ id: 2, name: "production" }],
      },
      "production-apply": {
        environment: {
          name: "production-apply",
          protection_rules: [
            {
              type: "required_reviewers",
              reviewers: [
                { type: "Team", reviewer: { id: 9002, type: "Team" } },
              ],
            },
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
        branchPolicies: [{ id: 3, name: "production" }],
      },
    },
  };
}

describe("planSettings — idempotence", () => {
  it("reports no drift, and no fixable changes, against a matching live snapshot", () => {
    const plan = planSettings(desiredFixture(), matchingSnapshot(), []);
    expect(plan.checks.every((c) => c.status === "ok")).toBe(true);
    expect(planHasChanges(plan)).toBe(false);
    expect(planHasFixableChanges(plan)).toBe(false);
  });

  it("re-planning the same snapshot a second time is byte-identical", () => {
    const a = planSettings(desiredFixture(), matchingSnapshot(), []);
    const b = planSettings(desiredFixture(), matchingSnapshot(), []);
    expect(a).toEqual(b);
  });
});

describe("planSettings — drift", () => {
  it("flags disabled secret scanning as drift, fixable", () => {
    const live = matchingSnapshot();
    live.repo.security_and_analysis!.secret_scanning = { status: "disabled" };
    const plan = planSettings(desiredFixture(), live, []);
    const check = plan.checks.find(
      (c) => c.key === "security_and_analysis.secret_scanning",
    )!;
    expect(check.status).toBe("drift");
    expect(check.fixable).toBe(true);
    expect(planHasFixableChanges(plan)).toBe(true);
  });

  it("reports a repo with security_and_analysis: null as unsupported, not drift", () => {
    const live = matchingSnapshot();
    live.repo.security_and_analysis = null;
    const plan = planSettings(desiredFixture(), live, []);
    const check = plan.checks.find(
      (c) => c.key === "security_and_analysis.secret_scanning",
    )!;
    expect(check.status).toBe("unsupported");
    expect(check.fixable).toBe(false);
  });

  it("reports a missing secret_scanning_non_provider_patterns field (plan lacks the feature) as unsupported", () => {
    const live = matchingSnapshot();
    delete live.repo.security_and_analysis!
      .secret_scanning_non_provider_patterns;
    const plan = planSettings(desiredFixture(), live, []);
    const check = plan.checks.find(
      (c) =>
        c.key === "security_and_analysis.secret_scanning_non_provider_patterns",
    )!;
    expect(check.status).toBe("unsupported");
  });

  it("flags disabled vulnerability alerts as drift, fixable", () => {
    const live = matchingSnapshot();
    live.vulnerabilityAlerts = false;
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "vulnerability_alerts"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });

  it("flags disabled dependabot security updates as drift, fixable", () => {
    const live = matchingSnapshot();
    live.automatedSecurityFixes = { enabled: false };
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "dependabot_security_updates"),
    ).toMatchObject({ status: "drift", fixable: true });
  });

  it("flags allowed_actions: all as drift against the desired selected", () => {
    const live = matchingSnapshot();
    live.actionsPermissions.allowed_actions = "all";
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "actions.allowed_actions"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });

  it("flags a stale patterns_allowed list as drift on actions.selected_actions", () => {
    const live = matchingSnapshot();
    live.selectedActions.patterns_allowed = ["some/other-action@*"];
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "actions.selected_actions"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });

  it("flags write default_workflow_permissions as drift", () => {
    const live = matchingSnapshot();
    live.workflowPermissions.default_workflow_permissions = "write";
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "actions.workflow_permissions"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });

  it("flags a staging branch policy that allows more than main as drift, fixable", () => {
    const live = matchingSnapshot();
    live.environments.staging.branchPolicies = [
      { id: 1, name: "main" },
      { id: 4, name: "hotfix" },
    ];
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "environments.staging.branch_policy"),
    ).toMatchObject({ status: "drift", fixable: true });
  });

  it("reports a missing environment as unsupported, never auto-created", () => {
    const live = matchingSnapshot();
    live.environments.production.environment = null;
    live.environments.production.branchPolicies = [];
    const plan = planSettings(desiredFixture(), live, []);
    expect(
      plan.checks.find((c) => c.key === "environments.production"),
    ).toMatchObject({
      status: "unsupported",
      fixable: false,
    });
  });

  it("flags production-apply with no required reviewers as drift, NEVER fixable", () => {
    const live = matchingSnapshot();
    live.environments["production-apply"].environment!.protection_rules = [];
    const plan = planSettings(desiredFixture(), live, []);
    const check = plan.checks.find(
      (c) => c.key === "environments.production-apply.required_reviewers",
    )!;
    expect(check.status).toBe("drift");
    expect(check.fixable).toBe(false);
  });

  it("does not check required reviewers on staging/production, which don't require them", () => {
    const plan = planSettings(desiredFixture(), matchingSnapshot(), []);
    expect(
      plan.checks.find(
        (c) => c.key === "environments.staging.required_reviewers",
      ),
    ).toBeUndefined();
    expect(
      plan.checks.find(
        (c) => c.key === "environments.production.required_reviewers",
      ),
    ).toBeUndefined();
  });
});

describe("planSettings — unpinned-action refusal", () => {
  const unpinned: ActionUse[] = [
    {
      raw: "subosito/flutter-action@v2",
      ref: { owner: "subosito", repo: "flutter-action", version: "v2" },
      file: ".github/workflows/ci.yaml",
      line: 42,
    },
  ];

  it("refuses sha_pinning_required (unsupported, not fixable) when a workflow uses: is unpinned", () => {
    const plan = planSettings(desiredFixture(), matchingSnapshot(), unpinned);
    expect(plan.refuseShaPinning).toBe(true);
    const check = plan.checks.find(
      (c) => c.key === "actions.sha_pinning_required",
    )!;
    expect(check.status).toBe("unsupported");
    expect(check.fixable).toBe(false);
    expect(check.desired).toContain("REFUSED");
  });

  it("carries the unpinned uses: list through onto the plan for the CLI to render", () => {
    const plan = planSettings(desiredFixture(), matchingSnapshot(), unpinned);
    expect(plan.unpinnedActions).toEqual(unpinned);
  });

  it("does not refuse other Actions checks (allowed_actions) when only pinning is refused", () => {
    const live = matchingSnapshot();
    live.actionsPermissions.allowed_actions = "all";
    const plan = planSettings(desiredFixture(), live, unpinned);
    expect(
      plan.checks.find((c) => c.key === "actions.allowed_actions"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });

  it("with no unpinned actions, sha_pinning_required is an ordinary fixable drift check", () => {
    const live = matchingSnapshot();
    live.actionsPermissions.sha_pinning_required = false;
    const plan = planSettings(desiredFixture(), live, []);
    expect(plan.refuseShaPinning).toBe(false);
    expect(
      plan.checks.find((c) => c.key === "actions.sha_pinning_required"),
    ).toMatchObject({
      status: "drift",
      fixable: true,
    });
  });
});
