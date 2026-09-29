import { git, gitRaw, tagRef } from "./git.js";
import { parseStepName } from "./tags.js";

/**
 * Personal branches. An attendee never commits on a workshop's own branch
 * (`02-supabase`, `main`, a detached tag checkout): their work lives on
 * `<github-username>/<workshop>`. Git can't enforce that (hooks aren't
 * cloned), so before the first commit a review would make, the shell asks
 * this module what to do. The decisions are pure and tested; the few git
 * calls at the bottom just carry them out.
 */

/** GitHub logins: 1-39 alphanumerics or single hyphens, not starting or ending with one. */
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function isValidUsername(name: string): boolean {
  return USERNAME.test(name);
}

/** Branch names the workshop repos use for their own tracks: `01-nextjs-intro`. */
const WORKSHOP_BRANCH = /^\d\d-[A-Za-z0-9][\w.-]*$/;

/** Default branches count as the workshop's own too: nobody's work belongs there. */
const DEFAULT_BRANCHES: ReadonlySet<string> = new Set(["main", "master"]);

/**
 * Whether `branch` belongs to the workshop repo rather than the attendee.
 * Detached HEAD (`null`) counts: a tag checkout is the workshop's too.
 * `workshops` are the names found in step tags; the `NN-slug` shape also
 * matches so a workshop with no tags yet is still recognised.
 */
export function isWorkshopBranch(branch: string | null, workshops: readonly string[]): boolean {
  if (branch === null) return true;
  return (
    DEFAULT_BRANCHES.has(branch) || workshops.includes(branch) || WORKSHOP_BRANCH.test(branch)
  );
}

/**
 * The workshop a branch belongs to, or undefined: `02-supabase` and
 * `sloan/02-supabase` are both `02-supabase`.
 */
export function workshopOfBranch(
  branch: string | null,
  workshops: readonly string[],
): string | undefined {
  if (branch === null) return undefined;
  const last = branch.slice(branch.lastIndexOf("/") + 1);
  return workshops.includes(last) ? last : undefined;
}

/**
 * The newest workshop: names lead with `NN-`, so the last one sorted. Only
 * names of that shape count, so leftover tags from before the rename
 * (`demo/01-read`) can't be mistaken for the newest workshop; if none has the
 * shape, any workshop will do.
 */
export function latestWorkshop(workshops: readonly string[]): string | undefined {
  const numbered = workshops.filter((w) => /^\d\d-/.test(w));
  return [...(numbered.length > 0 ? numbered : workshops)].sort().at(-1);
}

/** `sloan/02-supabase`. Throws on a name git could read as a flag or a range. */
export function personalBranchName(user: string, workshop: string): string {
  const name = `${user}/${workshop}`;
  if (!isValidUsername(user) || !/^[A-Za-z0-9][\w.-]*$/.test(workshop) || workshop.includes("..")) {
    throw new Error(`Not a usable branch name: ${name}`);
  }
  return name;
}

export type StartPoint =
  | { kind: "branch"; name: string; ref: string }
  | { kind: "tag"; name: string; ref: string };

export type BranchPlan =
  /** Already on a branch of their own: commit there. */
  | { kind: "stay"; branch: string }
  /** Their personal branch exists: switch to it, carrying uncommitted work. */
  | { kind: "switch"; branch: string }
  /** First time in this workshop: create it at `start`. */
  | { kind: "create"; branch: string; start: StartPoint };

export interface BranchPlanInput {
  user: string;
  /** The workshop the review is heading into (the target step's). */
  workshop: string;
  /** null when HEAD is detached. */
  currentBranch: string | null;
  workshops: readonly string[];
  localBranches: readonly string[];
  /** The workshop this one grew out of (`Start:` on its 00-start), if any. */
  previousWorkshop: string | undefined;
}

/**
 * Which branch a review's commits go on. The start point for a new branch is
 * their own branch for the previous workshop (their customisations come
 * along; the three-way merge keeps them) or, without one, the workshop's
 * `00-start` tag.
 */
export function planPersonalBranch(input: BranchPlanInput): BranchPlan {
  const { user, workshop, currentBranch, workshops, localBranches, previousWorkshop } = input;
  if (!isWorkshopBranch(currentBranch, workshops)) {
    return { kind: "stay", branch: currentBranch! };
  }
  const branch = personalBranchName(user, workshop);
  if (localBranches.includes(branch)) return { kind: "switch", branch };

  if (previousWorkshop) {
    const previous = personalBranchName(user, previousWorkshop);
    if (localBranches.includes(previous)) {
      return {
        kind: "create",
        branch,
        start: { kind: "branch", name: previous, ref: `refs/heads/${previous}` },
      };
    }
  }
  const startTag = `${workshop}/00-start`;
  return {
    kind: "create",
    branch,
    start: { kind: "tag", name: startTag, ref: tagRef(startTag) },
  };
}

/** The checked-out branch, or null on a detached HEAD. */
export async function currentBranch(cwd: string): Promise<string | null> {
  const { code, stdout } = await gitRaw(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], [1]);
  return code === 0 ? stdout.toString("utf8").trim() : null;
}

export async function localBranches(cwd: string): Promise<string[]> {
  const out = await git(cwd, ["for-each-ref", "--format=%(refname:lstrip=2)", "refs/heads/"]);
  return out.split("\n").filter(Boolean);
}

/**
 * Carries a plan out. `git switch` keeps uncommitted work in place (it only
 * refuses when a file they changed differs between the two commits, and says
 * so; the caller shows that message). Nothing here discards anything.
 */
export async function applyBranchPlan(cwd: string, plan: BranchPlan): Promise<void> {
  if (plan.kind === "stay") return;
  if (plan.kind === "switch") {
    await git(cwd, ["switch", "--end-of-options", plan.branch]);
    return;
  }
  await git(cwd, ["switch", "-c", plan.branch, "--end-of-options", plan.start.ref]);
}

/**
 * The escape hatch: points `<user>/<workshop>` at a step's tag and checks it
 * out, throwing away uncommitted changes to tracked files like the demo
 * laptops do. Untracked files stay. Callers confirm first.
 */
export async function jumpToStep(cwd: string, user: string, tag: string): Promise<string> {
  const name = parseStepName(tag);
  if (!name) throw new Error(`Not a step tag: ${tag}`);
  const branch = personalBranchName(user, name.workshop);
  await git(cwd, ["switch", "--discard-changes", "-C", branch, "--end-of-options", tagRef(tag)]);
  return branch;
}
