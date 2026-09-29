import type { Step } from "../core/index.js";

/**
 * What the Workshop panel shows for a repo's step line: every step after
 * each workshop's `00-start`, which ones the attendee has, and a header like
 * "Step 3 of 6". Pure so the numbers are tested; the tree view only renders it.
 */

export type StepState = "done" | "current" | "todo";

export interface StepRow {
  step: Step;
  state: StepState;
}

export interface StepsModel {
  rows: StepRow[];
  /** 1-based position of the current step among `rows`; 0 when none yet. */
  position: number;
  total: number;
  header: string;
}

/**
 * @param line    the whole line, oldest first, `00-start` markers included
 * @param current the newest step already in their history (null: none)
 */
export function buildStepsModel(line: readonly Step[], current: Step | null): StepsModel {
  const steps = line.filter((step) => step.number > 0);
  const currentIndex = current ? steps.findIndex((step) => step.tag === current.tag) : -1;
  const rows = steps.map<StepRow>((step, index) => ({
    step,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo",
  }));
  const position = currentIndex + 1;
  const total = steps.length;
  const header = position > 0 ? `Step ${position} of ${total}` : `Not started · ${total} steps`;
  return { rows, position, total, header };
}

/** `03 Post to the guestbook` style label for a step row. */
export function stepLabel(step: Step): string {
  const number = String(step.number).padStart(2, "0");
  return `${number} ${step.title || step.slug}`;
}
