import type { ReviewPlan, Step } from "../core/index.js";

/**
 * Small pure decisions between "a link or click named a step" and "a review
 * plan": which base to review from, whether to ask about skipped steps, and
 * how a `file=` link narrows a plan.
 */

export type BaseDecision =
  /** They already have the target (or later). */
  | { kind: "up-to-date" }
  | { kind: "ready"; base: Step }
  /**
   * More than one step lies between: ask "Review steps 3-5 together?".
   * `combined` reviews from the base; `single` only the target's own step.
   */
  | { kind: "ask-range"; combined: Step; single: Step };

/**
 * @param line     the whole step line
 * @param target   the step being opened
 * @param base     what they have: an explicit `from=` link value, or their current step
 * @param explicit true when the base came from the link; an explicit range is honoured without asking
 */
export function decideBase(
  line: readonly Step[],
  target: Step,
  base: Step,
  explicit: boolean,
): BaseDecision {
  const baseIndex = line.findIndex((s) => s.tag === base.tag);
  const targetIndex = line.findIndex((s) => s.tag === target.tag);
  if (baseIndex < 0 || targetIndex < 0 || baseIndex >= targetIndex)
    return { kind: "up-to-date" };
  if (explicit || targetIndex - baseIndex === 1) return { kind: "ready", base };
  return { kind: "ask-range", combined: base, single: line[targetIndex - 1]! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Step 3", "Steps 3–5", or across workshops "Steps 01-nextjs-intro/04 –
 * 02-supabase/02" (numbers alone would be ambiguous there).
 */
export function rangeLabel(steps: readonly Step[]): string {
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return "No steps";
  if (first.tag === last.tag) return `Step ${first.number}`;
  if (first.workshop !== last.workshop) {
    return `Steps ${first.workshop}/${pad(first.number)} – ${last.workshop}/${pad(last.number)}`;
  }
  return `Steps ${first.number}–${last.number}`;
}

/** The commit message a Finish would use: "Step 3: Title" / "Steps 3–5: Title of the last". */
export function reviewTitle(steps: readonly Step[]): string {
  const last = steps.at(-1);
  return `${rangeLabel(steps)}${last?.title ? `: ${last.title}` : ""}`;
}

/**
 * Narrows a plan to one file (a `file=` link). Commands are dropped: a link
 * to a single change is about that change, not about re-running installs.
 * Matches either side of a rename.
 */
export function restrictPlanToFile(plan: ReviewPlan, file: string): ReviewPlan {
  const matches = (f: { path: string; oldPath: string | undefined }) =>
    f.path === file || f.oldPath === file;
  return {
    ...plan,
    commands: [],
    files: plan.files.filter(matches),
    fromTarget: plan.fromTarget.filter(matches),
  };
}

export function planIsEmpty(plan: ReviewPlan): boolean {
  return (
    plan.files.length === 0 &&
    plan.fromTarget.length === 0 &&
    plan.commands.length === 0
  );
}
