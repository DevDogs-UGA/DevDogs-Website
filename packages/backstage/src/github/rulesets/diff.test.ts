import { describe, expect, it } from "vitest";
import { buildDesiredRulesets } from "./desired.js";
import { planHasChanges, planRulesets } from "./diff.js";
import type { LiveRuleset, LiveRulesetSummary } from "./types.js";

const actors = {
  devopsTeamId: 9002,
  focusLeadsTeamId: 9004,
  adminsTeamId: 9001,
  appId: 5001,
};
const desired = buildDesiredRulesets(actors);

describe("ruleset migration", () => {
  it("renames the combined main rule, creates split rules and deletes production", () => {
    const oldMain = desired.find((rule) => rule.name === "main-reviews")!;
    const production: LiveRuleset = {
      id: 2,
      name: "production",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/production"], exclude: [] },
      },
      bypass_actors: [],
      rules: [],
    };
    const main: LiveRuleset = { id: 1, ...oldMain, name: "main" };
    const summaries: LiveRulesetSummary[] = [
      { id: 1, name: "main", target: "branch" },
      { id: 2, name: "production", target: "branch" },
      { id: 3, name: "team/example", target: "branch" },
    ];
    const plan = planRulesets(
      summaries,
      new Map([
        [1, main],
        [2, production],
      ]),
      actors,
      desired,
    );

    expect(plan.updates).toContainEqual(
      expect.objectContaining({ id: 1, liveName: "main" }),
    );
    expect(plan.deletes).toContainEqual(
      expect.objectContaining({ id: 2, name: "production" }),
    );
    expect(plan.perTeamSkipped).toEqual(["team/example"]);
    expect(planHasChanges(plan)).toBe(true);
  });
});

describe("idempotence", () => {
  it("plans no changes once live matches desired", () => {
    const summaries = desired.map((rule, index) => ({
      id: index + 10,
      name: rule.name,
      target: rule.target,
    }));
    const details = new Map<number, LiveRuleset>(
      desired.map((rule, index) => [index + 10, { id: index + 10, ...rule }]),
    );
    const plan = planRulesets(summaries, details, actors, desired);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.noops).toHaveLength(desired.length);
    expect(planHasChanges(plan)).toBe(false);
  });

  it("normalizes status-check and actor ordering", () => {
    const ci = desired.find((rule) => rule.name === "main-ci")!;
    const live: LiveRuleset = {
      id: 1,
      ...ci,
      bypass_actors: [...ci.bypass_actors].reverse(),
      rules: ci.rules.map((rule) =>
        rule.type === "required_status_checks"
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                required_status_checks: [
                  ...rule.parameters.required_status_checks,
                ].reverse(),
              },
            }
          : rule,
      ),
    };
    const plan = planRulesets(
      [{ id: 1, name: "main-ci", target: "branch" }],
      new Map([[1, live]]),
      actors,
      [ci],
    );
    expect(plan.updates).toEqual([]);
  });
});
