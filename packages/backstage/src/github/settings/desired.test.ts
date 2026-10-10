import { describe, expect, it } from "vitest";
import { buildDesiredSettings } from "./desired.js";

describe("buildDesiredSettings", () => {
  it("enables secret scanning and its push protection, but not the two paid Secret Protection extras", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.securityAndAnalysis).toEqual({
      secretScanning: true,
      secretScanningPushProtection: true,
      secretScanningNonProviderPatterns: false,
      secretScanningValidityChecks: false,
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

  it("names the six deploy environments and publishing-next", () => {
    const desired = buildDesiredSettings([]);
    expect(desired.environments.map((e) => e.name)).toEqual([
      "publishing",
      "staging",
      "preflight",
      "staging-build",
      "production-build",
      "production",
      "publishing-next",
    ]);
  });

  it("publishing-next has no reviewers and runs from main only", () => {
    const next = buildDesiredSettings([]).environments.find(
      (e) => e.name === "publishing-next",
    );
    expect(next).toMatchObject({
      allowedBranches: ["main"],
      requireReviewers: false,
      preventSelfReview: false,
      createIfMissing: true,
    });
    expect(next?.reviewerTeams).toBeUndefined();
  });

  describe("Backstage", () => {
    const desired = buildDesiredSettings([], "Backstage");
    const env = (name: string) =>
      desired.environments.find((e) => e.name === name)!;

    it("names its six environments", () => {
      expect(desired.environments.map((e) => e.name)).toEqual([
        "publishing",
        "staging",
        "preflight",
        "staging-build",
        "production-build",
        "production",
      ]);
    });

    it("lets the two build environments run on merge-queue branches by glob", () => {
      for (const name of ["staging-build", "production-build"]) {
        expect(env(name).allowedBranches).toEqual([
          "main",
          "gh-readonly-queue/main/*",
        ]);
      }
    });

    it("gates publishing and production on the devops team, self-review prevented", () => {
      for (const name of ["publishing", "production"]) {
        expect(env(name)).toMatchObject({
          allowedBranches: ["main"],
          requireReviewers: true,
          preventSelfReview: true,
          reviewerTeams: ["devops"],
        });
      }
      for (const name of ["staging", "preflight"]) {
        expect(env(name).requireReviewers).toBe(false);
      }
    });

    it("creates every environment when missing, as DevDogsUGA does", () => {
      expect(desired.environments.every((e) => e.createIfMissing)).toBe(true);
      expect(
        buildDesiredSettings([]).environments.every((e) => e.createIfMissing),
      ).toBe(true);
    });

    it("shares DevDogsUGA's security, Dependabot and Actions settings", () => {
      const other = buildDesiredSettings([]);
      expect({ ...desired, environments: [] }).toEqual({
        ...other,
        environments: [],
      });
    });
  });
});
