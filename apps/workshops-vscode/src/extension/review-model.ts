import { applyDecisions, type Change, type Decision, type FileMerge, type ReviewFile } from "../core/index.js";

/**
 * The state of a review, with no VS Code in it: each file's three-way merge,
 * the decisions made so far, and the two texts its diff editor shows. The
 * controller renders this (diff editors, comment threads, the tree) and
 * mutates it; the rules are tested here.
 *
 * Left of a diff is their file. Right is the proposal: every change accepted
 * until they decide otherwise, so "Reject" makes that region snap back to
 * their code and the diff marker disappears, and undecided regions read as
 * "the step's version is on the right".
 */

export type FileStatus = "pending" | "accepted" | "rejected" | "partial";

export interface ReviewFileState {
  file: ReviewFile;
  merge: FileMerge;
  decisions: Map<number, Decision>;
}

/** Where one change sits in the right-hand text right now. */
export interface Region {
  id: number;
  /** 0-based first line in the right text. */
  start: number;
  /** Lines the region takes on the right (0 when the accepted side deletes them). */
  count: number;
  decision: Decision | undefined;
}

export interface Layout {
  text: string;
  regions: Region[];
}

/** No decision counts as accept on the right, so the proposal is what they see. */
export function proposalDecision(decisions: ReadonlyMap<number, Decision>, id: number): Decision {
  return decisions.get(id) ?? "accept";
}

export function fileStatus(state: Pick<ReviewFileState, "merge" | "decisions">): FileStatus {
  const total = state.merge.changes.length;
  // Nothing to decide (a pure rename): applied as the step has it.
  if (total === 0) return "accepted";
  const decided = [...state.decisions.values()];
  if (decided.length === 0) return "pending";
  const accepted = decided.filter((d) => d === "accept").length;
  if (decided.length === total) {
    if (accepted === total) return "accepted";
    if (accepted === 0) return "rejected";
  }
  return "partial";
}

/** The right-hand text and where each change lies in it. */
export function layoutFor(merge: FileMerge, decisions: ReadonlyMap<number, Decision>): Layout {
  let text = "";
  let line = 0;
  const regions: Region[] = [];
  for (const segment of merge.segments) {
    if (segment.kind === "same") {
      text += segment.lines.join("");
      line += segment.lines.length;
      continue;
    }
    const { change } = segment;
    const decision = decisions.get(change.id);
    const lines = proposalDecision(decisions, change.id) === "accept" ? change.theirs : change.ours;
    regions.push({ id: change.id, start: line, count: lines.length, decision });
    text += lines.join("");
    line += lines.length;
  }
  return { text, regions };
}

/** Their file as it is now (every change rejected): the left side. */
export function leftText(merge: FileMerge): string {
  return applyDecisions(merge, () => "reject").text;
}

/** The change whose region contains `line`, else the nearest one at or after it, else the last. */
export function changeAtLine(layout: Layout, line: number): number | undefined {
  const { regions } = layout;
  const hit = regions.find((r) => line >= r.start && line < r.start + Math.max(r.count, 1));
  if (hit) return hit.id;
  return (regions.find((r) => r.start >= line) ?? regions.at(-1))?.id;
}

export class ReviewModel {
  readonly files: ReviewFileState[];

  constructor(files: readonly { file: ReviewFile; merge: FileMerge }[]) {
    this.files = files.map(({ file, merge }) => ({ file, merge, decisions: new Map() }));
  }

  decide(fileIndex: number, changeId: number, decision: Decision): void {
    const state = this.files[fileIndex];
    if (state?.merge.changes.some((c: Change) => c.id === changeId)) state.decisions.set(changeId, decision);
  }

  decideFile(fileIndex: number, decision: Decision): void {
    const state = this.files[fileIndex];
    if (!state) return;
    for (const change of state.merge.changes) state.decisions.set(change.id, decision);
  }

  decideAll(decision: Decision): void {
    for (let i = 0; i < this.files.length; i++) this.decideFile(i, decision);
  }

  /** Changes with no decision yet, across all files. */
  get undecided(): number {
    return this.files.reduce(
      (sum, s) => sum + s.merge.changes.filter((c) => !s.decisions.has(c.id)).length,
      0,
    );
  }

  status(fileIndex: number): FileStatus {
    const state = this.files[fileIndex];
    return state ? fileStatus(state) : "pending";
  }

  layout(fileIndex: number): Layout {
    return layoutFor(this.files[fileIndex]!.merge, this.files[fileIndex]!.decisions);
  }

  /** The next file after `from` that still has an undecided change, wrapping; else the next file. */
  nextFile(from: number): number | undefined {
    const n = this.files.length;
    if (n === 0) return undefined;
    for (let step = 1; step <= n; step++) {
      const i = (from + step) % n;
      const state = this.files[i]!;
      if (state.merge.changes.some((c) => !state.decisions.has(c.id))) return i;
    }
    return n > 1 ? (from + 1) % n : undefined;
  }

  /** Every file's decision function, in the shape `resolveOutcome` takes. */
  decider(fileIndex: number): (id: number) => Decision | undefined {
    const state = this.files[fileIndex]!;
    return (id) => state.decisions.get(id);
  }
}
