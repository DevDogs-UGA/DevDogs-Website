import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { git, gitRaw, showFile, tagRef } from "./git.js";
import { applyDecisions, type Decision, type FileMerge } from "./merge.js";
import type { ReviewFile, TargetFile } from "./plan.js";
import { revParse } from "./tags.js";

/**
 * The git side of Finish. A finished review is a merge commit: HEAD is the
 * first parent and the step's tag commit the second, so "the step they're on"
 * is just the newest step tag in their history, a later plain `git merge
 * <tag>` finds the same base, and a rejected change stays rejected (the tag is
 * an ancestor now, so the merge never proposes it again).
 *
 * Only plumbing every git has (Ubuntu 22.04 ships 2.34): a temporary index
 * for `write-tree`, `commit-tree`, `update-ref`. The commit's tree is HEAD
 * plus the reviewed paths, so uncommitted work in any other file stays
 * uncommitted, and afterwards the real index is touched for those paths only.
 */

/** What to do with one reviewed file on disk. */
export type FileOutcome =
  | { kind: "write"; path: string; text: string; removeOldPath: string | undefined }
  | { kind: "delete"; path: string; removeOldPath: string | undefined }
  /** Their file stays as it is (all changes rejected, or nothing to change). */
  | { kind: "keep"; path: string };

/**
 * Turns decisions into an outcome, following `applyDecisions`' `exists` flag
 * for deletes. A rename whose changes were all rejected while they only have
 * the old name stays under the old name; otherwise (including a pure rename,
 * which has no changes to reject) the file moves to the new.
 *
 * @param oursAtNewPath whether their working tree has a file at `file.path`
 */
export function resolveOutcome(
  file: ReviewFile,
  merge: FileMerge,
  decide: (id: number) => Decision | undefined,
  oursAtNewPath: boolean,
): FileOutcome {
  const applied = applyDecisions(merge, decide);
  const anyAccepted = merge.changes.some((c) => decide(c.id) === "accept");
  const removeOldPath = file.oldPath !== undefined && file.oldPath !== file.path ? file.oldPath : undefined;

  if (removeOldPath !== undefined && !oursAtNewPath && merge.changes.length > 0 && !anyAccepted) {
    return { kind: "keep", path: file.oldPath! };
  }
  if (!applied.exists) return { kind: "delete", path: file.path, removeOldPath };
  return { kind: "write", path: file.path, text: applied.text, removeOldPath };
}

export interface FinishInput {
  /** The clone's top level. */
  root: string;
  targetTag: string;
  /** "Step 3: Title" / "Steps 3–5: Title". */
  message: string;
  outcomes: readonly FileOutcome[];
  /** Lockfiles and binaries: copied from the target, never reviewed. */
  fromTarget: readonly TargetFile[];
  /** true: commit the merge. false: stage it and leave MERGE_HEAD for their own commit. */
  autoCommit: boolean;
  /**
   * Runs once, right before the first write. The shell puts the attendee on
   * their personal branch here. Returning false aborts with nothing written.
   */
  beforeWrite?: () => Promise<boolean>;
}

export interface FinishResult {
  /** The merge commit, or null when it was left staged for them to commit. */
  commit: string | null;
  /** Repo-relative paths written, removed or kept as part of the review. */
  paths: string[];
}

function inside(root: string, path: string): string {
  const abs = resolve(root, path);
  if (!abs.startsWith(resolve(root) + (process.platform === "win32" ? "\\" : "/"))) {
    throw new Error(`Refusing to touch a path outside the clone: ${path}`);
  }
  return abs;
}

async function writeIfChanged(abs: string, data: Buffer | string): Promise<void> {
  const next = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  if (existsSync(abs)) {
    try {
      if ((await readFile(abs)).equals(next)) return;
    } catch {
      // Unreadable (a directory?): let writeFile report it.
    }
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, next);
}

/**
 * Git has no name to commit under (a fresh install never ran `git config
 * user.name`). Thrown before anything is written, so Finish can ask and retry.
 */
export class MissingIdentityError extends Error {
  constructor() {
    super("Git doesn't know your name and email yet.");
    this.name = "MissingIdentityError";
  }
}

/** Whether `git commit` here would find an author and committer. */
export async function hasCommitIdentity(root: string): Promise<boolean> {
  for (const variable of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    const { code } = await gitRaw(root, ["var", variable], [128]);
    if (code !== 0) return false;
  }
  return true;
}

/** Writes the decided files to the working tree, then commits or stages them. */
export async function finishReview(input: FinishInput): Promise<FinishResult | null> {
  const { root, targetTag } = input;
  const targetCommit = await revParse(root, tagRef(targetTag));
  if (!targetCommit) throw new Error(`No such step: ${targetTag}`);
  if (input.autoCommit && !(await hasCommitIdentity(root))) throw new MissingIdentityError();

  if (input.beforeWrite && !(await input.beforeWrite())) return null;

  const paths = new Set<string>();
  const remove = async (path: string) => {
    await rm(inside(root, path), { force: true });
    paths.add(path);
  };

  for (const outcome of input.outcomes) {
    if (outcome.kind === "keep") continue;
    if (outcome.kind === "write") {
      await writeIfChanged(inside(root, outcome.path), outcome.text);
      paths.add(outcome.path);
    } else {
      await remove(outcome.path);
    }
    if (outcome.removeOldPath) await remove(outcome.removeOldPath);
  }
  for (const file of input.fromTarget) {
    const bytes = file.status === "deleted" ? null : await showFile(root, tagRef(targetTag), file.path);
    if (bytes === null) await remove(file.path);
    else {
      await writeIfChanged(inside(root, file.path), bytes);
      paths.add(file.path);
    }
    if (file.oldPath && file.oldPath !== file.path) await remove(file.oldPath);
  }
  // `-f`: a step may ship a file the repo's .gitignore matches (`.env.example`
  // under `.env*`); it is tracked at the tag, so it must be tracked here too.
  const list = [...paths];
  const literal = { env: { GIT_LITERAL_PATHSPECS: "1" } };

  if (!input.autoCommit) {
    // Stage the result and leave a merge in progress: their own `git commit`
    // (or the Source Control panel) then records a merge with the step as
    // second parent.
    if (list.length > 0) await git(root, ["add", "-A", "-f", "--", ...list], literal);
    const gitDir = (await git(root, ["rev-parse", "--absolute-git-dir"])).trim();
    await writeFile(join(gitDir, "MERGE_HEAD"), `${targetCommit}\n`);
    // "no-ff" is what `git merge --no-ff --no-commit` writes: without it `git commit`
    // drops HEAD as a parent whenever the step is ahead of it (a fast-forward).
    await writeFile(join(gitDir, "MERGE_MODE"), "no-ff");
    await writeFile(join(gitDir, "MERGE_MSG"), `${input.message}\n`);
    return { commit: null, paths: list };
  }

  const head = await revParse(root, "HEAD");
  if (!head) throw new Error("This repository has no commits yet.");

  // A private index: HEAD's tree plus the reviewed paths from the working tree.
  const dir = await mkdtemp(join(tmpdir(), "workshops-index-"));
  try {
    const env = { GIT_INDEX_FILE: join(dir, "index"), GIT_LITERAL_PATHSPECS: "1" };
    await git(root, ["read-tree", "--end-of-options", head], { env });
    if (list.length > 0) await git(root, ["add", "-A", "-f", "--", ...list], { env });
    const tree = (await git(root, ["write-tree"], { env })).trim();
    const commit = (
      await git(root, ["commit-tree", tree, "-p", head, "-p", targetCommit, "-m", input.message])
    ).trim();
    await git(root, ["update-ref", "-m", `workshop: ${input.message}`, "HEAD", commit, head]);
    // The real index learns about the reviewed paths only; anything else they
    // had staged stays staged.
    if (list.length > 0) {
      await gitRaw(root, ["reset", "-q", "--", ...list], [], literal);
    }
    return { commit, paths: list };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
