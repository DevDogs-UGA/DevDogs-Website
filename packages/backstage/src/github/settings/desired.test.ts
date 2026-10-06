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

  it("names exactly preflight, staging, production-build and production, in that order", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.environments.map((e) => e.name)).toEqual([
      "preflight",
      "staging",
      "production-build",
      "production",
    ]);
  });

  it("restricts every environment to main", () => {
    const desired = buildDesiredSettings([]);
    for (const env of desired.environments) {
      expect(env.allowedBranches, env.name).toEqual(["main"]);
    }
  });

  it("requires reviewers, with self-review prevented, on production only", () => {
    const desired = buildDesiredSettings([]);
    for (const env of desired.environments) {
      expect(env.requireReviewers, env.name).toBe(env.name === "production");
      expect(env.preventSelfReview, env.name).toBe(env.name === "production");
    }
  });
});
