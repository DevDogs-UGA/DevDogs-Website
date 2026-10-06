/**
 * Pure post-processing of a `RulesetPlan`: withholds creates and updates that
 * must not be applied yet, and records why so a dry run explains itself.
 *
 * Today's only gate is the merge queue. A `merge_queue` rule on `main` makes
 * GitHub wait for required checks on the queue's temporary
 * `gh-readonly-queue/main/*` branch, and a workflow with no `merge_group`
 * trigger never runs there: the first queued PR would hang until the check
 * timeout. So the rule is refused until the target repo's default-branch
 * `.github/workflows/ci.yaml` carries a `merge_group` trigger.
 */
import { hasMergeQueueRule } from "./desired.js";
import type { RulesetPlan } from "./diff.js";

export interface MergeQueueGate {
  ready: boolean;
  /** Shown in the plan when not ready. */
  reason: string;
}

/** Whether a workflow file's text declares a `merge_group` trigger (any `on:` form). */
export function hasMergeGroupTrigger(workflow: string): boolean {
  return workflow
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .some(
      (line) =>
        /^\s*merge_group\s*:/.test(line) ||
        /^\s*on\s*:.*\bmerge_group\b/.test(line),
    );
}

export function applyGates(
  plan: RulesetPlan,
  gate: MergeQueueGate | null,
  notes: readonly string[] = [],
): RulesetPlan {
  const blocked: { name: string; reason: string }[] = [];
  if (gate && !gate.ready) {
    const refuse = (name: string) =>
      blocked.push({ name, reason: gate.reason });
    for (const c of plan.creates)
      if (hasMergeQueueRule(c.desired)) refuse(c.desired.name);
    for (const u of plan.updates)
      if (hasMergeQueueRule(u.desired)) refuse(u.desired.name);
  }
  const names = new Set(blocked.map((b) => b.name));
  return {
    ...plan,
    creates: plan.creates.filter((c) => !names.has(c.desired.name)),
    updates: plan.updates.filter((u) => !names.has(u.desired.name)),
    blocked,
    notes: [...notes],
  };
}
