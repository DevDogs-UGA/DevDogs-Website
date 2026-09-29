import { diffIndices } from "node-diff3";

/**
 * Per-file three-way merge, kept apart from git so it is pure and easy to
 * test. base is the last step they have, ours is their working file, theirs
 * is the step being reviewed.
 *
 * Unlike a plain merge this marks EVERY change, not only conflicts:
 *  - only ours changed a region -> no change (their edit stays);
 *  - both made the same edit    -> no change;
 *  - theirs changed a region ours left alone, or both changed it
 *    differently -> a change whose proposal is theirs (the step's version).
 * Rejecting a change keeps ours, so their code always survives a "no".
 *
 * Lines keep their terminators (`"a\n"`), so joining segments reproduces the
 * file byte-for-byte, CRLF and a missing final newline included.
 */

export type Decision = "accept" | "reject";

export interface Change {
  /** Position among the file's changes; the key for decisions. */
  id: number;
  /** The region at the base. */
  base: string[];
  /** The region in their working file. */
  ours: string[];
  /** The region at the step's tag: the proposal. */
  theirs: string[];
  /** Line index of `ours` within their working file. */
  oursStart: number;
  /** Line index of `theirs` within the file with every change accepted. */
  acceptedStart: number;
}

export type Segment =
  | { kind: "same"; lines: string[] }
  | { kind: "change"; change: Change };

export interface FileMerge {
  segments: Segment[];
  changes: Change[];
  /** The file exists in their working tree. */
  oursExists: boolean;
  /** The file exists at the step's tag (false: the step deletes it). */
  theirsExists: boolean;
}

export interface MergeInput {
  /** File text at the base; null if the file didn't exist there. */
  base: string | null;
  /** Working-tree text; null if they don't have the file. */
  ours: string | null;
  /** Text at the target; null if the step deletes the file. */
  theirs: string | null;
}

/** Splits into lines, each keeping its own terminator. */
export function splitLines(text: string | null): string[] {
  if (!text) return [];
  return text.split(/(?<=\n)/);
}

interface Hunk {
  side: "ours" | "theirs";
  /** Range in the base that this side replaced. */
  start: number;
  length: number;
  /** Range in that side's own lines that replaced it. */
  sideStart: number;
  sideLength: number;
}

function hunksOf(base: string[], side: string[], name: Hunk["side"]): Hunk[] {
  return diffIndices(base, side).map((d) => ({
    side: name,
    start: d.buffer1[0],
    length: d.buffer1[1],
    sideStart: d.buffer2[0],
    sideLength: d.buffer2[1],
  }));
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/**
 * Three-way merges one file into segments. Hunks that overlap or touch in
 * the base form one region (touching counts, as in git and diff3); each side
 * is then read back over the whole region so the three views line up.
 */
export function mergeFile(input: MergeInput): FileMerge {
  const base = splitLines(input.base);
  const ours = splitLines(input.ours);
  const theirs = splitLines(input.theirs);

  const hunks = [...hunksOf(base, ours, "ours"), ...hunksOf(base, theirs, "theirs")].sort(
    (a, b) => a.start - b.start,
  );

  const segments: Segment[] = [];
  const changes: Change[] = [];
  let cursor = 0; // position in base
  let oursLen = 0; // lines of ours consumed
  let acceptedLen = 0; // lines of the accept-everything file produced

  const pushSame = (lines: string[]) => {
    if (lines.length === 0) return;
    const last = segments[segments.length - 1];
    if (last?.kind === "same") last.lines.push(...lines);
    else segments.push({ kind: "same", lines: [...lines] });
    oursLen += lines.length;
    acceptedLen += lines.length;
  };

  let i = 0;
  while (i < hunks.length) {
    const first = hunks[i]!;
    let end = first.start + first.length;
    const group = [first];
    i++;
    while (i < hunks.length && hunks[i]!.start <= end) {
      const next = hunks[i]!;
      end = Math.max(end, next.start + next.length);
      group.push(next);
      i++;
    }
    const start = first.start;
    pushSame(base.slice(cursor, start));

    // Read a side back over [start, end): its hunks' own lines, with the
    // base filling any gap (skew correction, as diff3 does).
    const view = (side: Hunk["side"], lines: string[]): string[] => {
      const own = group.filter((h) => h.side === side);
      if (own.length === 0) return base.slice(start, end);
      const head = own[0]!;
      const tail = own[own.length - 1]!;
      const from = head.sideStart - (head.start - start);
      const to = tail.sideStart + tail.sideLength + (end - (tail.start + tail.length));
      return lines.slice(from, to);
    };
    const regionBase = base.slice(start, end);
    const regionOurs = view("ours", ours);
    const regionTheirs = view("theirs", theirs);

    if (sameLines(regionOurs, regionTheirs) || !group.some((h) => h.side === "theirs")) {
      // Same edit on both sides, or only ours edited: nothing to propose.
      pushSame(regionOurs);
    } else {
      const change: Change = {
        id: changes.length,
        base: regionBase,
        ours: regionOurs,
        theirs: regionTheirs,
        oursStart: oursLen,
        acceptedStart: acceptedLen,
      };
      changes.push(change);
      segments.push({ kind: "change", change });
      oursLen += regionOurs.length;
      acceptedLen += regionTheirs.length;
    }
    cursor = end;
  }
  pushSame(base.slice(cursor));

  return {
    segments,
    changes,
    oursExists: input.ours !== null,
    theirsExists: input.theirs !== null,
  };
}

export interface AppliedFile {
  text: string;
  /** False when the result is a file that shouldn't exist (deleted). */
  exists: boolean;
}

/**
 * Produces the file for a set of decisions. A change with no decision takes
 * `fallback`, "reject" by default so undecided changes leave their code
 * alone.
 */
export function applyDecisions(
  merge: FileMerge,
  decisions: ReadonlyMap<number, Decision> | ((id: number) => Decision | undefined),
  fallback: Decision = "reject",
): AppliedFile {
  const decide = (id: number): Decision =>
    (typeof decisions === "function" ? decisions(id) : decisions.get(id)) ?? fallback;

  let text = "";
  for (const segment of merge.segments) {
    if (segment.kind === "same") text += segment.lines.join("");
    else {
      const { change } = segment;
      text += (decide(change.id) === "accept" ? change.theirs : change.ours).join("");
    }
  }
  // A file only stops existing when nothing is left of it AND one side never
  // had it: accepting a delete, or rejecting an add they never had.
  const exists = !(text === "" && (!merge.oursExists || !merge.theirsExists));
  return { text, exists };
}

/** Accept every change: the file as the step has it, merged with their extras. */
export function acceptAll(merge: FileMerge): AppliedFile {
  return applyDecisions(merge, () => "accept");
}

/** Reject every change: their file, untouched. */
export function rejectAll(merge: FileMerge): AppliedFile {
  return applyDecisions(merge, () => "reject");
}
