import { describe, expect, it } from "vitest";
import {
  LEGACY_NAME_ALIASES,
  buildDesiredRulesets,
  isPerTeamRulesetName,
} from "./desired.js";

const actors = { devopsTeamId: 9002, adminsTeamId: 9001, appId: 5001 };

describe("buildDesiredRulesets", () => {
  const desired = buildDesiredRulesets(actors);

  it("builds exactly the five fixed rulesets, by name", () => {
    expect(desired.map((d) => d.name)).toEqual([
      "main",
      "production",
      "~ALL",
      "team/**",
      "tag-protection",
    ]);
  });

  it("restricts main to devops, squash-only PR merges", () => {
    const main = desired.find((d) => d.name === "main")!;
    expect(main.conditions.ref_name.include).toEqual(["refs/heads/main"]);
    expect(main.bypass_actors).toEqual([
      { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
    ]);
    expect(main.rules.map((r) => r.type).sort()).toEqual(
      ["deletion", "non_fast_forward", "pull_request", "update"].sort(),
    );
    const pr = main.rules.find((r) => r.type === "pull_request");
    expect(pr).toMatchObject({
      parameters: { allowed_merge_methods: ["squash"] },
    });
  });

  it("restricts production to devops PR-only bypass, code-owner review, merge-only", () => {
    const production = desired.find((d) => d.name === "production")!;
    expect(production.conditions.ref_name.include).toEqual([
      "refs/heads/production",
    ]);
    expect(production.bypass_actors).toEqual([
      { actor_id: 9002, actor_type: "Team", bypass_mode: "pull_request" },
    ]);
    const pr = production.rules.find((r) => r.type === "pull_request");
    expect(pr).toMatchObject({
      parameters: {
        allowed_merge_methods: ["merge"],
        require_code_owner_review: true,
      },
    });
  });

  it("~ALL blocks update/creation/deletion/non_fast_forward everywhere except team/**", () => {
    const allBranches = desired.find((d) => d.name === "~ALL")!;
    expect(allBranches.conditions.ref_name).toEqual({
      include: ["~ALL"],
      exclude: ["refs/heads/team/**"],
    });
    expect(allBranches.rules.map((r) => r.type).sort()).toEqual(
      ["update", "creation", "deletion", "non_fast_forward"].sort(),
    );
  });

  it("~ALL bypasses devops always, and omits Renovate when unresolved", () => {
    const allBranches = desired.find((d) => d.name === "~ALL")!;
    expect(allBranches.bypass_actors).toEqual([
      { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("~ALL bypasses Renovate too, when its App id is resolved", () => {
    const withRenovate = buildDesiredRulesets({
      ...actors,
      renovateAppId: 7001,
    });
    const allBranches = withRenovate.find((d) => d.name === "~ALL")!;
    expect(allBranches.bypass_actors).toEqual([
      { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
      { actor_id: 7001, actor_type: "Integration", bypass_mode: "always" },
    ]);
  });

  it("team/** allows creation/deletion/non_fast_forward but not update, bypassed by the App and devops", () => {
    const teamFixed = desired.find((d) => d.name === "team/**")!;
    expect(teamFixed.rules.map((r) => r.type).sort()).toEqual(
      ["creation", "deletion", "non_fast_forward"].sort(),
    );
    expect(teamFixed.rules.some((r) => r.type === "update")).toBe(false);
    expect(teamFixed.bypass_actors).toEqual([
      { actor_id: 5001, actor_type: "Integration", bypass_mode: "always" },
      { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("keeps the tag ruleset's live name and shape", () => {
    const tags = desired.find((d) => d.name === "tag-protection")!;
    expect(tags.target).toBe("tag");
    expect(tags.rules.map((r) => r.type).sort()).toEqual(
      ["creation", "deletion", "update"].sort(),
    );
    expect(tags.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
      { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
    ]);
  });
});

describe("LEGACY_NAME_ALIASES", () => {
  it("recognizes main-protection as the live name of the main slot", () => {
    expect(LEGACY_NAME_ALIASES.main).toContain("main-protection");
  });
});

describe("isPerTeamRulesetName", () => {
  it("recognizes team/<slug> rulesets", () => {
    expect(isPerTeamRulesetName("team/frontend")).toBe(true);
    expect(isPerTeamRulesetName("team/schedule-builder-2")).toBe(true);
  });

  it("does not treat the fixed team/** creation ruleset as a per-team one", () => {
    expect(isPerTeamRulesetName("team/**")).toBe(false);
  });

  it("does not match unrelated names", () => {
    expect(isPerTeamRulesetName("main")).toBe(false);
    expect(isPerTeamRulesetName("tag-protection")).toBe(false);
  });
});
