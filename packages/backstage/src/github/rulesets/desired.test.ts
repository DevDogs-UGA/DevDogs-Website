import { describe, expect, it } from "vitest";
import { applyGates, hasMergeGroupTrigger } from "./gates.js";
import { planRulesets } from "./diff.js";
import {
  BACKSTAGE_MERGE_QUEUE,
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

  it("lets Renovate bypass main-reviews only via pull request, when resolved", () => {
    const withRenovate = buildDesiredRulesets({
      ...actors,
      renovateAppId: 2740,
    });
    expect(
      withRenovate.find((r) => r.name === "main-reviews")!.bypass_actors,
    ).toContainEqual({
      actor_id: 2740,
      actor_type: "Integration",
      bypass_mode: "pull_request",
    });
    const without = desired.find((r) => r.name === "main-reviews")!;
    expect(
      without.bypass_actors.some((a) => a.actor_type === "Integration"),
    ).toBe(false);
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

describe("buildDesiredRulesets for Backstage", () => {
  const backstageActors = {
    devopsTeamId: 9002,
    focusLeadsTeamId: 9004,
    adminsTeamId: 9001,
  };
  const without = buildDesiredRulesets(backstageActors, "Backstage");
  const withApp = buildDesiredRulesets(
    { ...backstageActors, deployPrAppId: 7777, renovateAppId: 2740 },
    "Backstage",
  );

  it("has no team/** rulesets, platform App or Renovate bypass", () => {
    expect(without.map((r) => r.name)).toEqual([
      "main-integrity",
      "main-updates",
      "main-reviews",
      "main-ci",
      "main-merge-queue",
      "~ALL",
      "tag-protection",
    ]);
    for (const r of withApp) {
      expect(r.bypass_actors.map((a) => a.actor_id)).not.toContain(2740);
    }
  });

  it("requires only validate in main-ci", () => {
    expect(without.find((r) => r.name === "main-ci")!.rules).toEqual([
      {
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          strict_required_status_checks_policy: false,
          required_status_checks: [
            { context: "validate", integration_id: 15368 },
          ],
        },
      },
    ]);
  });

  it("keeps the merge queue in its own ruleset, with admins able to bypass it", () => {
    const queue = without.find((r) => r.name === "main-merge-queue")!;
    expect(queue.rules).toEqual([BACKSTAGE_MERGE_QUEUE]);
    expect(queue.bypass_actors).toEqual([
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    for (const r of without.filter((r) => r.name !== "main-merge-queue")) {
      expect(r.rules.map((x) => x.type)).not.toContain("merge_queue");
    }
    expect(BACKSTAGE_MERGE_QUEUE.parameters).toMatchObject({
      merge_method: "SQUASH",
      grouping_strategy: "ALLGREEN",
      min_entries_to_merge: 1,
      max_entries_to_merge: 5,
      max_entries_to_build: 5,
      min_entries_to_merge_wait_minutes: 5,
      check_response_timeout_minutes: 60,
    });
  });

  it("skips deploy/devdogsuga and keeps ~ALL covering it while the App is missing", () => {
    expect(without.find((r) => r.name === "deploy/devdogsuga")).toBeUndefined();
    expect(
      without.find((r) => r.name === "~ALL")!.conditions.ref_name.exclude,
    ).toEqual(["refs/heads/main"]);
  });

  it("lets only admins and the deploy-PR App bypass deploy/devdogsuga, which ~ALL then excludes", () => {
    const deploy = withApp.find((r) => r.name === "deploy/devdogsuga")!;
    expect(deploy.conditions.ref_name.include).toEqual([
      "refs/heads/deploy/devdogsuga",
    ]);
    expect(deploy.bypass_actors).toEqual([
      { actor_id: 7777, actor_type: "Integration", bypass_mode: "always" },
      { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
    ]);
    expect(deploy.rules.map((r) => r.type).sort()).toEqual([
      "creation",
      "deletion",
      "non_fast_forward",
      "update",
    ]);
    const all = withApp.find((r) => r.name === "~ALL")!;
    expect(all.conditions.ref_name.exclude).toEqual([
      "refs/heads/main",
      "refs/heads/deploy/devdogsuga",
    ]);
    expect(all.bypass_actors.map((a) => a.actor_id).sort()).toEqual([
      9001, 9002, 9004,
    ]);
  });

  it("matches DevDogsUGA's main-integrity, main-updates, main-reviews and tag-protection", () => {
    const dd = buildDesiredRulesets(actors);
    for (const name of ["main-integrity", "main-updates", "tag-protection"]) {
      expect(without.find((r) => r.name === name)).toEqual(
        dd.find((r) => r.name === name),
      );
    }
    expect(without.find((r) => r.name === "main-reviews")).toEqual(
      dd.find((r) => r.name === "main-reviews"),
    );
  });
});

describe("merge queue gate", () => {
  const backstageActors = {
    devopsTeamId: 9002,
    focusLeadsTeamId: 9004,
    adminsTeamId: 9001,
  };
  const desired = buildDesiredRulesets(backstageActors, "Backstage");
  const empty = planRulesets([], new Map(), backstageActors, desired);

  it("detects merge_group triggers in every on: form, ignoring comments", () => {
    expect(hasMergeGroupTrigger("on:\n  pull_request:\n  merge_group:\n")).toBe(
      true,
    );
    expect(hasMergeGroupTrigger("on: [push, merge_group]\n")).toBe(true);
    expect(hasMergeGroupTrigger("# merge_group: later\non:\n  push:\n")).toBe(
      false,
    );
  });

  it("withholds the queue ruleset, with a reason, until CI runs on merge_group", () => {
    const plan = applyGates(empty, { ready: false, reason: "no merge_group" });
    expect(plan.blocked).toEqual([
      { name: "main-merge-queue", reason: "no merge_group" },
    ]);
    expect(plan.creates.map((c) => c.desired.name)).not.toContain(
      "main-merge-queue",
    );
    expect(plan.creates.map((c) => c.desired.name)).toContain("main-ci");
  });

  it("lets it through when ready", () => {
    const plan = applyGates(empty, { ready: true, reason: "" });
    expect(plan.blocked).toEqual([]);
    expect(plan.creates.map((c) => c.desired.name)).toContain(
      "main-merge-queue",
    );
  });
});
