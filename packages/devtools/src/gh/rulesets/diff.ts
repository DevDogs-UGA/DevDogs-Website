/**
 * Live ruleset list -> a plan of creates/updates/deletes/no-ops, against
 * `desired.ts`'s five fixed rulesets.
 *
 * Every live ruleset is classified exactly once, by name, into one of four
 * buckets — and the classification is what makes this reconciler safe to
 * re-run against a live org: it only ever writes to a ruleset it can name a
 * reason for touching.
 *
 *   1. A per-team ruleset (`isPerTeamRulesetName`) — owned by
 *      `teamSync.ts` in DevDogsUGA. Never read past its name, never
 *      diffed, never appears in any action list. `blast radius` here is
 *      the whole point: a bug that let this reconciler touch a team's
 *      ruleset would silently rewrite that team's own bypass actor.
 *   2. Named in `DELETE_RULESET_NAMES` — deleted outright.
 *   3. The canonical name (or a `LEGACY_NAME_ALIASES` entry) of a desired
 *      ruleset — created if absent, updated (by id, renamed if the alias
 *      matched) if its live shape differs, left as a no-op if it already
 *      matches.
 *   4. Anything else — reported, never touched. An unrecognized ruleset is
 *      as likely to be something Sloan added by hand for a reason this
 *      reconciler doesn't know as it is to be drift, and only
 *      `DELETE_RULESET_NAMES` is trusted to mean "remove this".
 */
import {
  DELETE_RULESET_NAMES,
  LEGACY_NAME_ALIASES,
  isPerTeamRulesetName,
  type RulesetActors,
} from "./desired.js";
import type {
  DesiredRuleset,
  LiveRuleset,
  LiveRulesetSummary,
  Rule,
} from "./types.js";

export interface CreateAction {
  kind: "create";
  desired: DesiredRuleset;
}

export interface UpdateAction {
  kind: "update";
  id: number;
  /** The live ruleset's current name, when different from `desired.name` — a rename is part of this update. */
  liveName: string;
  desired: DesiredRuleset;
}

export interface DeleteAction {
  kind: "delete";
  id: number;
  name: string;
}

export interface NoopEntry {
  name: string;
  id: number;
}

export interface RulesetPlan {
  creates: CreateAction[];
  updates: UpdateAction[];
  deletes: DeleteAction[];
  noops: NoopEntry[];
  /** Per-team rulesets seen live, by name — reported for visibility, never acted on. */
  perTeamSkipped: string[];
  /** Live rulesets that matched no desired slot and no delete name — reported, never acted on. */
  unmanaged: string[];
}

/**
 * Reduces a rule to the fields this reconciler manages, in a fixed key order,
 * so a live rule and its desired twin compare equal whenever they protect
 * the same way.
 *
 * Two ways GitHub's copy differs from what was sent, both seen live on
 * 2026-09-27 right after creating `production`:
 *
 * - it omits parameters that hold their default, so `update` comes back with
 *   no `update_allows_fetch_and_merge` (see `UpdateRule.parameters`' doc in
 *   `types.ts`);
 * - it adds `pull_request` parameters `desired.ts` never sets
 *   (`dismissal_restriction`, `require_extra_approval_for_unattributed_changes`,
 *   `required_reviewers`), in its own key order.
 *
 * Without this, every ruleset with a `pull_request` rule planned an update on
 * every run, so the reconciler never settled.
 */
function canonicalizeRule(rule: Rule): Rule {
  if (rule.type === "update") {
    return {
      type: "update",
      parameters: {
        update_allows_fetch_and_merge:
          rule.parameters?.update_allows_fetch_and_merge ?? false,
      },
    };
  }
  if (rule.type === "pull_request") {
    const p = rule.parameters;
    return {
      type: "pull_request",
      parameters: {
        allowed_merge_methods: [...p.allowed_merge_methods].sort(),
        dismiss_stale_reviews_on_push: p.dismiss_stale_reviews_on_push,
        require_code_owner_review: p.require_code_owner_review,
        require_last_push_approval: p.require_last_push_approval,
        required_approving_review_count: p.required_approving_review_count,
        required_review_thread_resolution: p.required_review_thread_resolution,
      },
    };
  }
  return { type: rule.type };
}

function sortRules(rules: readonly Rule[]): Rule[] {
  return [...rules]
    .map(canonicalizeRule)
    .sort((a, b) => a.type.localeCompare(b.type));
}

/** Sorted, and each actor rebuilt in a fixed key order for the same reason as `canonicalizeRule`. */
function sortActors(
  actors: readonly {
    actor_id: number;
    actor_type: string;
    bypass_mode: string;
  }[],
) {
  return [...actors]
    .sort(
      (a, b) =>
        a.actor_type.localeCompare(b.actor_type) || a.actor_id - b.actor_id,
    )
    .map((a) => ({
      actor_id: a.actor_id,
      actor_type: a.actor_type,
      bypass_mode: a.bypass_mode,
    }));
}

/**
 * A canonical, order-independent string for one ruleset's PROTECTION shape —
 * everything except its name and id. Two rulesets that protect identically
 * but list their rules or bypass actors in a different order must compare
 * equal; GitHub does not promise a stable order for either.
 */
function fingerprint(r: {
  target: string;
  enforcement: string;
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  bypass_actors: readonly {
    actor_id: number;
    actor_type: string;
    bypass_mode: string;
  }[];
  rules: readonly Rule[];
}): string {
  return JSON.stringify({
    target: r.target,
    enforcement: r.enforcement,
    conditions: {
      ref_name: {
        include: [...r.conditions.ref_name.include].sort(),
        exclude: [...r.conditions.ref_name.exclude].sort(),
      },
    },
    bypass_actors: sortActors(r.bypass_actors),
    rules: sortRules(r.rules),
  });
}

/** Every name a live ruleset could carry and still BE `desired` — its canonical name plus any legacy alias. */
function candidateNames(desired: DesiredRuleset): string[] {
  return [desired.name, ...(LEGACY_NAME_ALIASES[desired.name] ?? [])];
}

/**
 * Builds the plan. `liveDetails` must carry one fully-fetched `LiveRuleset`
 * for every summary in `liveSummaries` EXCEPT per-team ones — `commands.ts`
 * is expected to skip fetching those, since there can be up to ~70 of them
 * and this reconciler never reads past their name either way.
 */
export function planRulesets(
  liveSummaries: readonly LiveRulesetSummary[],
  liveDetails: ReadonlyMap<number, LiveRuleset>,
  actors: RulesetActors,
  desiredRulesets: readonly DesiredRuleset[],
): RulesetPlan {
  const plan: RulesetPlan = {
    creates: [],
    updates: [],
    deletes: [],
    noops: [],
    perTeamSkipped: [],
    unmanaged: [],
  };

  const matchedLiveIds = new Set<number>();

  for (const desired of desiredRulesets) {
    const names = candidateNames(desired);
    const live = liveSummaries.find((s) => names.includes(s.name));

    if (!live) {
      plan.creates.push({ kind: "create", desired });
      continue;
    }

    matchedLiveIds.add(live.id);
    const detail = liveDetails.get(live.id);
    if (!detail) {
      throw new Error(
        `planRulesets: no detail fetched for live ruleset "${live.name}" (id ${live.id})`,
      );
    }

    const renamed = detail.name !== desired.name;
    const drifted = fingerprint(detail) !== fingerprint(desired);

    if (renamed || drifted) {
      plan.updates.push({
        kind: "update",
        id: live.id,
        liveName: detail.name,
        desired,
      });
    } else {
      plan.noops.push({ name: desired.name, id: live.id });
    }
  }

  for (const live of liveSummaries) {
    if (matchedLiveIds.has(live.id)) continue;
    if (isPerTeamRulesetName(live.name)) {
      plan.perTeamSkipped.push(live.name);
      continue;
    }
    if (DELETE_RULESET_NAMES.includes(live.name)) {
      plan.deletes.push({ kind: "delete", id: live.id, name: live.name });
      continue;
    }
    plan.unmanaged.push(live.name);
  }

  return plan;
}

/** Whether a plan would write anything at all. */
export function planHasChanges(plan: RulesetPlan): boolean {
  return (
    plan.creates.length > 0 ||
    plan.updates.length > 0 ||
    plan.deletes.length > 0
  );
}
