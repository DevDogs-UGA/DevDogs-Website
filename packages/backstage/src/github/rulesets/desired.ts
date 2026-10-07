import type { DesiredRuleset } from "./types.js";

/** Numeric actors resolved from the live organization before planning. */
export interface RulesetActors {
  devopsTeamId: number;
  focusLeadsTeamId: number;
  adminsTeamId: number;
  /** The platform App (`team/**` bypass); DevDogsUGA only. */
  appId?: number;
  renovateAppId?: number;
  /**
   * The deploy-PR App (`devdogs-deploy-pr`), which force-pushes
   * `deploy/devdogsuga`. Absent until the App is created and installed;
   * Backstage's `deploy/devdogsuga` ruleset is then skipped.
   */
  deployPrAppId?: number;
}

export type RulesetRepo = "DevDogsUGA" | "Backstage";

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
export function buildDesiredRulesets(
  actors: RulesetActors,
  repo: RulesetRepo = "DevDogsUGA",
): DesiredRuleset[] {
  return repo === "Backstage"
    ? buildBackstageRulesets(actors)
    : buildDevDogsUgaRulesets(actors);
}

/**
 * Merge queue parameters for `main` (Backstage and DevDogsUGA share them): squash (matching
 * `main-reviews`' squash-only), ALLGREEN grouping (every entry in a group
 * must pass), up to 5 entries built and merged together, merge as soon as 1
 * entry is ready after waiting 5 minutes for more, 60 minute check timeout.
 */
export const BACKSTAGE_MERGE_QUEUE = {
  type: "merge_queue",
  parameters: {
    check_response_timeout_minutes: 60,
    grouping_strategy: "ALLGREEN",
    max_entries_to_build: 5,
    max_entries_to_merge: 5,
    merge_method: "SQUASH",
    min_entries_to_merge: 1,
    min_entries_to_merge_wait_minutes: 5,
  },
} as const;

/** Rule types that gate `--apply` on the target repo's CI having a `merge_group` trigger. */
export function hasMergeQueueRule(ruleset: DesiredRuleset): boolean {
  return ruleset.rules.some((r) => r.type === "merge_queue");
}

/**
 * Backstage's fixed rulesets. Same split as DevDogsUGA's (a bypass actor
 * bypasses every rule in its ruleset), with:
 *
 * - `main-merge-queue` on its own: admins must still push directly
 *   (TASK-478), and a queue-only ruleset lets them bypass the queue without
 *   widening any other rule's bypass.
 * - `deploy/devdogsuga`: only admins and the deploy-PR App bypass, and the
 *   App bypasses `always` because it creates, force-pushes and updates the
 *   branch; every other actor is blocked from all four operations. Omitted
 *   (and `~ALL` then covers the branch) until the App is installed.
 * - no Renovate bypass: its install on Backstage is not readable from here.
 * - no `team/**` rulesets (a DevDogsUGA concern).
 */
const RELEASE_TAGS = "refs/tags/@devdogsuga/**";

function buildBackstageRulesets(actors: RulesetActors): DesiredRuleset[] {
  const deployBranch = "refs/heads/deploy/devdogsuga";
  const deployRuleset: DesiredRuleset[] =
    actors.deployPrAppId === undefined
      ? []
      : [
          {
            name: "deploy/devdogsuga",
            target: "branch",
            enforcement: "active",
            conditions: {
              ref_name: { include: [deployBranch], exclude: [] },
            },
            bypass_actors: [
              {
                actor_id: actors.deployPrAppId,
                actor_type: "Integration",
                bypass_mode: "always",
              },
              always(actors.adminsTeamId),
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
        ];
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
      bypass_actors: [always(actors.adminsTeamId)],
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
            // `database` and `toolchain` joined `validate` when the platform
            // moved in (TASK-478): the DB-backed platform tests and the
            // catalog/patch drift check against DevDogsUGA. `patch-issues`
            // runs on the schedule only and must never be required.
            required_status_checks: [
              { context: "validate", integration_id: 15368 },
              { context: "database", integration_id: 15368 },
              { context: "toolchain", integration_id: 15368 },
            ],
          },
        },
      ],
    },
    mainMergeQueueRuleset(actors),
    {
      name: "~ALL",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["~ALL"],
          // Excluding the deploy branch only once its own ruleset exists —
          // until then `~ALL` keeps protecting it from everyone but the
          // admins, devops and focus-leads bypass teams.
          exclude: [
            "refs/heads/main",
            ...(deployRuleset.length > 0 ? [deployBranch] : []),
          ],
        },
      },
      bypass_actors: [
        always(actors.focusLeadsTeamId),
        always(actors.devopsTeamId),
        always(actors.adminsTeamId),
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
    ...deployRuleset,
    {
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/tags/**"], exclude: [RELEASE_TAGS] },
      },
      bypass_actors: [always(actors.adminsTeamId), always(actors.devopsTeamId)],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
    // The publish job tags every release it creates (`<name>@<version>`) with
    // `GITHUB_TOKEN`, and GitHub refuses GitHub Actions as a bypass actor
    // (422). So release tags may be created by anyone who can push, but once
    // created never moved or deleted.
    {
      name: "release-tags",
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: [RELEASE_TAGS], exclude: [] } },
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [{ type: "update" }, { type: "deletion" }],
    },
  ];
}

/** `main-merge-queue`: queue-only so admins can still push directly past it (TASK-478). */
function mainMergeQueueRuleset(actors: RulesetActors): DesiredRuleset {
  return {
    name: "main-merge-queue",
    target: "branch",
    enforcement: "active",
    conditions: main,
    bypass_actors: [always(actors.adminsTeamId)],
    rules: [
      {
        ...BACKSTAGE_MERGE_QUEUE,
        parameters: { ...BACKSTAGE_MERGE_QUEUE.parameters },
      },
    ],
  };
}

function buildDevDogsUgaRulesets(actors: RulesetActors): DesiredRuleset[] {
  if (actors.appId === undefined) {
    throw new Error("DevDogsUGA rulesets need the platform App id (appId)");
  }
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
    mainMergeQueueRuleset(actors),
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
