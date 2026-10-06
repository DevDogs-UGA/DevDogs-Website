import type { DesiredRuleset } from "./types.js";

/** Numeric actors resolved from the live organization before planning. */
export interface RulesetActors {
  devopsTeamId: number;
  focusLeadsTeamId: number;
  adminsTeamId: number;
  appId: number;
  renovateAppId?: number;
}

/** Earlier live names which occupy the same managed slot. */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> =
  {
    "main-reviews": ["main", "main-protection"],
  };

/** Obsolete fixed rulesets removed after the production-branch cutover. */
export const DELETE_RULESET_NAMES: readonly string[] = [
  "comp-branches",
  "production",
];

export function isPerTeamRulesetName(name: string): boolean {
  return name.startsWith("team/") && name !== "team/**";
}

const main = { ref_name: { include: ["refs/heads/main"], exclude: [] } };

const always = (actor_id: number) => ({
  actor_id,
  actor_type: "Team" as const,
  bypass_mode: "always" as const,
});

/**
 * Fixed DevDogsUGA rulesets.
 *
 * The main policy is deliberately split. A bypass actor bypasses every rule
 * in one ruleset, so combining immutable history, PR reviews, updates and CI
 * would make a direct-push exception an accidental force-push exception too.
 */
export function buildDesiredRulesets(actors: RulesetActors): DesiredRuleset[] {
  return [
    {
      name: "main-integrity",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
    {
      name: "main-updates",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [
        {
          actor_id: actors.focusLeadsTeamId,
          actor_type: "Team",
          bypass_mode: "pull_request",
        },
        {
          actor_id: actors.devopsTeamId,
          actor_type: "Team",
          bypass_mode: "pull_request",
        },
        always(actors.adminsTeamId),
      ],
      rules: [
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
      ],
    },
    {
      name: "main-reviews",
      target: "branch",
      enforcement: "active",
      conditions: main,
      // Renovate (App) may bypass the review requirement only by opening a
      // pull request (`pull_request`), never by pushing; admins bypass always.
      bypass_actors: [
        ...(actors.renovateAppId === undefined
          ? []
          : [
              {
                actor_id: actors.renovateAppId,
                actor_type: "Integration" as const,
                bypass_mode: "pull_request" as const,
              },
            ]),
        always(actors.adminsTeamId),
      ],
      rules: [
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["squash"],
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true,
          },
        },
      ],
    },
    {
      name: "main-ci",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            do_not_enforce_on_create: false,
            strict_required_status_checks_policy: false,
            required_status_checks: [
              { context: "validate", integration_id: 15368 },
              { context: "database", integration_id: 15368 },
              { context: "format", integration_id: 15368 },
              { context: "flutter", integration_id: 15368 },
            ],
          },
        },
      ],
    },
    {
      name: "~ALL",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["~ALL"],
          exclude: ["refs/heads/main", "refs/heads/team/**"],
        },
      },
      bypass_actors: [
        always(actors.focusLeadsTeamId),
        always(actors.devopsTeamId),
        always(actors.adminsTeamId),
        ...(actors.renovateAppId === undefined
          ? []
          : [
              {
                actor_id: actors.renovateAppId,
                actor_type: "Integration" as const,
                bypass_mode: "always" as const,
              },
            ]),
      ],
      rules: [
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
        { type: "creation" },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
    {
      name: "team/**",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/team/**"], exclude: [] },
      },
      bypass_actors: [
        {
          actor_id: actors.appId,
          actor_type: "Integration",
          bypass_mode: "always",
        },
        always(actors.adminsTeamId),
      ],
      rules: [
        { type: "creation" },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
    {
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/tags/**"], exclude: [] },
      },
      bypass_actors: [always(actors.adminsTeamId), always(actors.devopsTeamId)],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
  ];
}
