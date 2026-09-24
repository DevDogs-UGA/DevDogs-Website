/**
 * The shapes this reconciler reads and writes.
 *
 * Deliberately a narrower slice of GitHub's repository-ruleset schema than
 * Octokit's generated types (devtools has no Octokit dependency — every
 * GitHub call in this package goes through the `gh` CLI, see `../client.ts`'s
 * header for why). Only the rule types and bypass-actor shapes this
 * reconciler actually emits are represented; a rule type nothing here builds
 * is deliberately unrepresentable, the same reasoning
 * `apps/platform/src/server/github/rulesets.ts`'s `RulesetRule` gives for
 * doing the same with a smaller set.
 */

export type RulesetTarget = "branch" | "tag";

export interface BypassActor {
  actor_id: number;
  actor_type: "Team" | "Integration";
  bypass_mode: "always" | "pull_request";
}

export interface UpdateRule {
  type: "update";
  // Optional because GitHub omits it entirely on a ruleset the API (or the
  // web UI) created without ever setting it — the live `tag-protection` and
  // `main-protection` rulesets both do this. `diff.ts`'s fingerprint fills
  // the default (`false`) before comparing, so an absent field here and an
  // explicit `false` compare equal.
  parameters?: { update_allows_fetch_and_merge: boolean };
}

export interface DeletionRule {
  type: "deletion";
}

export interface NonFastForwardRule {
  type: "non_fast_forward";
}

export interface CreationRule {
  type: "creation";
}

export interface PullRequestRule {
  type: "pull_request";
  parameters: {
    allowed_merge_methods: ("merge" | "squash" | "rebase")[];
    dismiss_stale_reviews_on_push: boolean;
    require_code_owner_review: boolean;
    require_last_push_approval: boolean;
    required_approving_review_count: number;
    required_review_thread_resolution: boolean;
  };
}

export type Rule =
  | UpdateRule
  | DeletionRule
  | NonFastForwardRule
  | CreationRule
  | PullRequestRule;

export interface RulesetConditions {
  ref_name: { include: string[]; exclude: string[] };
}

/** What this reconciler wants a ruleset to look like, name included. */
export interface DesiredRuleset {
  name: string;
  target: RulesetTarget;
  enforcement: "active";
  bypass_actors: BypassActor[];
  conditions: RulesetConditions;
  rules: Rule[];
}

/** One entry from `GET /repos/{owner}/{repo}/rulesets` — name and id only. */
export interface LiveRulesetSummary {
  id: number;
  name: string;
  target?: string;
}

/** The full shape from `GET /repos/{owner}/{repo}/rulesets/{id}`. */
export interface LiveRuleset {
  id: number;
  name: string;
  target: RulesetTarget;
  enforcement: string;
  bypass_actors: BypassActor[];
  conditions: RulesetConditions;
  rules: Rule[];
}
