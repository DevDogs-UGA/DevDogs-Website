import { describe, expect, it } from "vitest";
import { buildDesiredSettings } from "./desired.js";

describe("buildDesiredSettings", () => {
  it("enables secret scanning and its push protection, plus the two public-repo extras", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.securityAndAnalysis).toEqual({
      secretScanning: true,
      secretScanningPushProtection: true,
      secretScanningNonProviderPatterns: true,
      secretScanningValidityChecks: true,
    });
  });

  it("enables Dependabot alerts and security updates", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.vulnerabilityAlerts).toBe(true);
    expect(desired.dependabotSecurityUpdates).toBe(true);
  });

  it("wants SHA pinning required and allowed_actions: selected with the given patterns, sorted", () => {
    const desired = buildDesiredSettings([
      "subosito/flutter-action@*",
      "actions/checkout@*",
    ]);
    expect(desired.actions).toEqual({
      shaPinningRequired: true,
      allowedActions: "selected",
      githubOwnedAllowed: true,
      verifiedAllowed: true,
      patterns: ["actions/checkout@*", "subosito/flutter-action@*"],
    });
  });

  it("wants read-only default workflow permissions with no PR-review approval", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.workflowPermissions).toEqual({
      defaultWorkflowPermissions: "read",
      canApprovePullRequestReviews: false,
    });
  });

  it("names exactly staging, production and production-apply, in that order", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.environments.map((e) => e.name)).toEqual([
      "staging",
      "production",
      "production-apply",
    ]);
  });

  it("restricts staging to main and production/production-apply to production", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.environments.find((e) => e.name === "staging")!.allowedBranches).toEqual([
      "main",
    ]);
    expect(
      desired.environments.find((e) => e.name === "production")!.allowedBranches,
    ).toEqual(["production"]);
    expect(
      desired.environments.find((e) => e.name === "production-apply")!.allowedBranches,
    ).toEqual(["production"]);
  });

  it("requires reviewers on production-apply only", () => {
    const desired = buildDesiredSettings([]);
    for (const env of desired.environments) {
      expect(env.requireReviewers).toBe(env.name === "production-apply");
    }
  });
});
