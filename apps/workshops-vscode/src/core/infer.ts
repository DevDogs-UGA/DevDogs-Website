import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { showFile, tagRef } from "./git.js";
import { isLockfile, looksBinary, diffTags } from "./plan.js";
import type { Step } from "./tags.js";

/**
 * Fallback for attendees whose branch has no step tag in its history (they
 * typed along live and never committed a merge): guess which step their
 * working tree is at, and say how sure we are so a UI can ask "Looks like
 * you're at step 2. Right?".
 *
 * Errors here are one-sided. A guess that's too EARLY is safe: the changes
 * they already have match and drop out of the review. A guess that's too LATE
 * silently loses the skipped step's code. So every doubt resolves early.
 */

/** A step counts as "applied" when this share of its signal lines match. */
const APPLIED = 0.75;
/** Below this confidence the guess is stepped back one. */
const SURE = 0.7;

export interface StepGuess {
  step: Step;
  /** 0..1: how sure we are that this is the latest step they have. */
  confidence: number;
  /** True when doubt moved the answer one step earlier than the best match. */
  guessedEarly: boolean;
  /** Share of each step's own changes present in the tree, by tag; null when a step changes nothing measurable. */
  scores: ReadonlyMap<string, number | null>;
}

/** A line worth comparing: not blank and not just braces or punctuation. */
function signal(line: string): string | null {
  const trimmed = line.trim();
  return trimmed.length >= 3 && /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
}

function signalSet(text: string | null): Set<string> {
  const lines = new Set<string>();
  if (text === null) return lines;
  for (const raw of text.split(/\r?\n/)) {
    const line = signal(raw);
    if (line !== null) lines.add(line);
  }
  return lines;
}

async function workingText(root: string, path: string): Promise<string | null> {
  try {
    const bytes = await readFile(join(root, path));
    return looksBinary(bytes) ? null : bytes.toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw error;
  }
}

async function tagText(
  root: string,
  tag: string,
  path: string,
): Promise<string | null> {
  const bytes = await showFile(root, tagRef(tag), path);
  return bytes === null || looksBinary(bytes) ? null : bytes.toString("utf8");
}

/**
 * How much of what `step` changed relative to `previous` is in the working
 * tree. For each text file it touched, lines the step added count as matched
 * when they're in the working file, and lines it removed when they're gone.
 * Null when the step has no measurable lines (say, it only touched lockfiles).
 */
async function scoreStep(
  root: string,
  previous: Step,
  step: Step,
): Promise<number | null> {
  let matched = 0;
  let total = 0;
  for (const file of await diffTags(root, previous.tag, step.tag)) {
    if (isLockfile(file.path)) continue;
    const before = signalSet(
      await tagText(root, previous.tag, file.oldPath ?? file.path),
    );
    const after = signalSet(await tagText(root, step.tag, file.path));
    const working = signalSet(await workingText(root, file.path));
    for (const line of after) {
      if (before.has(line)) continue;
      total++;
      if (working.has(line)) matched++;
    }
    for (const line of before) {
      if (after.has(line)) continue;
      total++;
      if (!working.has(line)) matched++;
    }
  }
  return total === 0 ? null : matched / total;
}

/**
 * Infers the latest step whose changes are mostly in the working tree at
 * `root`, scanning from the newest step down. Falls back to the first step of
 * the line (`00-start`) when nothing matches. Never returns a step later than
 * the best match.
 */
export async function inferStepFromWorkingTree(
  root: string,
  line: readonly Step[],
): Promise<StepGuess> {
  if (line.length === 0) throw new Error("No steps to infer from");
  const scores = new Map<string, number | null>();
  let best = -1;
  let nextScore = 0;

  for (let i = line.length - 1; i >= 1; i--) {
    const score = await scoreStep(root, line[i - 1]!, line[i]!);
    scores.set(line[i]!.tag, score);
    if (score !== null && score >= APPLIED) {
      best = i;
      break;
    }
    if (score !== null) nextScore = Math.max(nextScore, score);
  }

  if (best < 0) {
    // Nothing matches: they're at the start. Sure to the degree that nothing
    // came close.
    return {
      step: line[0]!,
      confidence: 1 - nextScore,
      guessedEarly: false,
      scores,
    };
  }

  // The step just after the match, if it was scored, tells how much of the
  // NEXT step they already have; a high value means the match may be late.
  const after = line[best + 1] ? (scores.get(line[best + 1]!.tag) ?? 0) : 0;
  const matchScore = scores.get(line[best]!.tag) ?? 0;
  const confidence = matchScore * (1 - after);
  if (confidence < SURE) {
    return { step: line[best - 1]!, confidence, guessedEarly: true, scores };
  }
  return { step: line[best]!, confidence, guessedEarly: false, scores };
}
