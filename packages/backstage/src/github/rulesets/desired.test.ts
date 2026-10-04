import { describe, expect, it } from "vitest";
import {
  DELETE_RULESET_NAMES,
  LEGACY_NAME_ALIASES,
  buildDesiredRulesets,
  isPerTeamRulesetName,
} from "./desired.js";

const actors = {
  devopsTeamId: 9002,
  focusLeadsTeamId: 9004,
  adminsTeamId: 9001,
  appId: 5001,
};

describe("buildDesiredRulesets", () => {
  const desired = buildDesiredRulesets(actors);

  it("splits main rules so direct-push bypass never bypasses integrity", () => {
    expect(desired.map((rule) => rule.name)).toEqual([
      "main-integrity",
      "main-updates",
      "main-reviews",
      "main-ci",
      "~ALL",
      "team/**",
      "tag-protection",
    ]);
    expect(
      desired.find((rule) => rule.name === "main-integrity"),
    ).toMatchObject({
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    });
  });

  it("lets reviewers merge PRs while only admins direct-push", () => {
    const updates = desired.find((rule) => rule.name === "main-updates")!;
    expect(updates.bypass_actors).toEqual([
      { actor_id: 9004, actor_type: "Team", bypass_mode: "pull_request" },
      { actor_id: 9002, actor_type: "Team", bypass_mode: "pull_request" },
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("requires one code-owner approval from someone other than the last pusher", () => {
    const reviews = desired.find((rule) => rule.name === "main-reviews")!;
    expect(reviews.rules[0]).toMatchObject({
      type: "pull_request",
      parameters: {
        allowed_merge_methods: ["squash"],
        require_code_owner_review: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    });
    expect(reviews.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("requires CI for everyone except the admin break-glass team", () => {
    const ci = desired.find((rule) => rule.name === "main-ci")!;
    expect(ci.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    expect(ci.rules[0]).toMatchObject({
      type: "required_status_checks",
      parameters: {
        required_status_checks: [
          { context: "validate" },
          { context: "database" },
          { context: "format" },
          { context: "flutter" },
        ],
      },
    });
  });

  it("excludes main and team branches from the broad backstop", () => {
    const all = desired.find((rule) => rule.name === "~ALL")!;
    expect(all.conditions.ref_name).toEqual({
      include: ["~ALL"],
      exclude: ["refs/heads/main", "refs/heads/team/**"],
    });
    expect(all.bypass_actors).toContainEqual({
      actor_id: 9004,
      actor_type: "Team",
      bypass_mode: "always",
    });
    expect(all.bypass_actors).toContainEqual({
      actor_id: 9002,
      actor_type: "Team",
      bypass_mode: "always",
    });
  });

  it("reserves team branches for the platform, competition team, and admins", () => {
    const team = desired.find((rule) => rule.name === "team/**")!;
    expect(team.bypass_actors).toEqual([
      { actor_id: 5001, actor_type: "Integration", bypass_mode: "always" },
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
  });
});

describe("migration names", () => {
  it("renames the old combined main ruleset and removes production", () => {
    expect(LEGACY_NAME_ALIASES["main-reviews"]).toContain("main");
    expect(DELETE_RULESET_NAMES).toContain("production");
  });
});

describe("isPerTeamRulesetName", () => {
  it("distinguishes exact team rules from the managed wildcard", () => {
    expect(isPerTeamRulesetName("team/frontend")).toBe(true);
    expect(isPerTeamRulesetName("team/**")).toBe(false);
    expect(isPerTeamRulesetName("main")).toBe(false);
  });
});
