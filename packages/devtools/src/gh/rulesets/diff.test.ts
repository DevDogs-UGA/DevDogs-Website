import { describe, expect, it } from "vitest";
import { buildDesiredRulesets } from "./desired.js";
import { planHasChanges, planRulesets } from "./diff.js";
import type { LiveRuleset, LiveRulesetSummary } from "./types.js";

const actors = { devopsTeamId: 9002, adminsTeamId: 9001, appId: 5001 };
const desired = buildDesiredRulesets(actors);

/**
 * Sanitized shape of `gh api repos/DevDogsUGA/DevDogsUGA/rulesets` and the
 * per-id detail GETs, read live on 2026-09-24 (ids and team ids changed;
 * the structure — including that `main-protection` carries no `update`
 * rule and that `production` has no ruleset at all — is real). This is the
 * exact bug TASK-322 fixes: `main-protection` blocks deletion and
 * force-push only, so a plain push lands on `main` directly, and
 * `production` has nothing at all, so a push there deploys.
 */
const LIVE_SUMMARIES: LiveRulesetSummary[] = [
  { id: 100, name: "main-protection", target: "branch" },
  { id: 101, name: "comp-branches", target: "branch" },
  { id: 102, name: "tag-protection", target: "tag" },
  { id: 103, name: "team/frontend", target: "branch" },
  { id: 104, name: "team/schedule-builder", target: "branch" },
  { id: 105, name: "some-other-ruleset", target: "branch" },
];

const LIVE_DETAILS = new Map<number, LiveRuleset>([
  [
    100,
    {
      id: 100,
      name: "main-protection",
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
  ],
  [
    101,
    {
      id: 101,
      name: "comp-branches",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/comp/**"], exclude: [] },
      },
      bypass_actors: [
        { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
        { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
      ],
      rules: [
        { type: "update" },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
  ],
  [
    102,
    {
      id: 102,
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/**"], exclude: [] } },
      bypass_actors: [
        { actor_id: 9001, actor_type: "Team", bypass_mode: "always" },
        { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
      ],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
  ],
  [
    105,
    {
      id: 105,
      name: "some-other-ruleset",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/experimental/**"], exclude: [] },
      },
      bypass_actors: [],
      rules: [{ type: "update" }],
    },
  ],
  // 103 and 104 (team/*) are deliberately absent: planRulesets must never
  // need their detail to classify and skip them.
]);

describe("planRulesets against the live fixture", () => {
  const plan = planRulesets(LIVE_SUMMARIES, LIVE_DETAILS, actors, desired);

  it("creates the three rulesets with no live equivalent", () => {
    expect(plan.creates.map((c) => c.desired.name).sort()).toEqual(
      ["production", "team/**", "~ALL"].sort(),
    );
  });

  it("updates (and renames) main-protection into main", () => {
    expect(plan.updates).toHaveLength(1);
    const [update] = plan.updates;
    expect(update.id).toBe(100);
    expect(update.liveName).toBe("main-protection");
    expect(update.desired.name).toBe("main");
  });

  it("leaves tag-protection as a no-op — its live shape already matches", () => {
    expect(plan.noops).toEqual([{ name: "tag-protection", id: 102 }]);
  });

  it("deletes comp-branches", () => {
    expect(plan.deletes).toEqual([
      { kind: "delete", id: 101, name: "comp-branches" },
    ]);
  });

  it("never touches per-team rulesets — reports them, does not plan against them", () => {
    expect(plan.perTeamSkipped.sort()).toEqual(
      ["team/frontend", "team/schedule-builder"].sort(),
    );
    const allTouchedIds = [
      ...plan.creates.map(() => -1),
      ...plan.updates.map((u) => u.id),
      ...plan.deletes.map((d) => d.id),
      ...plan.noops.map((n) => n.id),
    ];
    expect(allTouchedIds).not.toContain(103);
    expect(allTouchedIds).not.toContain(104);
  });

  it("leaves an unrecognized ruleset alone, reported as unmanaged", () => {
    expect(plan.unmanaged).toEqual(["some-other-ruleset"]);
  });

  it("has changes to apply", () => {
    expect(planHasChanges(plan)).toBe(true);
  });
});

describe("idempotence", () => {
  it("plans no changes once live already matches desired", () => {
    const summaries: LiveRulesetSummary[] = desired.map((d, i) => ({
      id: 200 + i,
      name: d.name,
      target: d.target,
    }));
    const details = new Map<number, LiveRuleset>(
      desired.map((d, i) => [200 + i, { id: 200 + i, ...d }]),
    );

    const plan = planRulesets(summaries, details, actors, desired);

    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.noops).toHaveLength(desired.length);
    expect(planHasChanges(plan)).toBe(false);
  });

  it("matches GitHub's own copy of a ruleset it just created", () => {
    // `production` exactly as GitHub returned it on 2026-09-27, moments after
    // this reconciler created it (team id swapped for the fixture's): the
    // `update` rule's default parameter dropped, three `pull_request`
    // parameters added, and its own key order throughout.
    const productionDesired = desired.find((d) => d.name === "production")!;
    const live: LiveRuleset = {
      id: 1,
      name: "production",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { exclude: [], include: ["refs/heads/production"] },
      },
      bypass_actors: [
        {
          actor_id: actors.devopsTeamId,
          actor_type: "Team",
          bypass_mode: "pull_request",
        },
      ],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "update" },
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["merge"],
            dismiss_stale_reviews_on_push: false,
            dismissal_restriction: { allowed_actors: [], enabled: false },
            require_code_owner_review: true,
            require_extra_approval_for_unattributed_changes: true,
            require_last_push_approval: false,
            required_approving_review_count: 1,
            required_review_thread_resolution: false,
            required_reviewers: [],
          },
        } as unknown as LiveRuleset["rules"][number],
      ],
    };
    const summaries: LiveRulesetSummary[] = [
      { id: 1, name: "production", target: "branch" },
    ];

    const plan = planRulesets(summaries, new Map([[1, live]]), actors, [
      productionDesired,
    ]);

    expect(plan.updates).toEqual([]);
    expect(plan.noops).toEqual([{ name: "production", id: 1 }]);
  });

  it("still plans an update when a managed pull_request parameter differs", () => {
    const mainDesired = desired.find((d) => d.name === "main")!;
    const live: LiveRuleset = {
      id: 1,
      ...mainDesired,
      rules: mainDesired.rules.map((rule) =>
        rule.type === "pull_request"
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                allowed_merge_methods: ["merge"],
              },
            }
          : rule,
      ),
    };
    const summaries: LiveRulesetSummary[] = [
      { id: 1, name: "main", target: "branch" },
    ];

    const plan = planRulesets(summaries, new Map([[1, live]]), actors, [
      mainDesired,
    ]);

    expect(plan.updates).toHaveLength(1);
  });

  it("is insensitive to rule and bypass-actor ORDER on the live side", () => {
    const mainDesired = desired.find((d) => d.name === "main")!;
    const reordered: LiveRuleset = {
      id: 1,
      ...mainDesired,
      rules: [...mainDesired.rules].reverse(),
      bypass_actors: [...mainDesired.bypass_actors].reverse(),
    };
    const summaries: LiveRulesetSummary[] = [
      { id: 1, name: "main", target: "branch" },
    ];
    const details = new Map<number, LiveRuleset>([[1, reordered]]);

    const plan = planRulesets(summaries, details, actors, [mainDesired]);

    expect(plan.updates).toEqual([]);
    expect(plan.noops).toEqual([{ name: "main", id: 1 }]);
  });
});
