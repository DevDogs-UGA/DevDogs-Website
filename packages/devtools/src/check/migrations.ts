/**
 * `check migrations`: CI's guard for `supabase/migrations/`, one flat
 * directory with no per-schema subfolders (`platform` | `schedule_builder` |
 * `study_group_finder` all interleave there by filename alone). A file's
 * timestamp prefix is the only thing that orders it against every other
 * migration, on every developer's machine and in Supabase's own migration
 * table, so a new file timestamped BEFORE the newest one already on the base
 * branch sorts into the past: anyone who reruns migrations from scratch after
 * merging applies it out of the order its author tested it in, and CI's
 * "migrations apply cleanly from scratch" job never catches it, because a
 * single fresh runner applies every file in one pass regardless of what
 * merged when.
 *
 * The rule: before merging a migration, recreate it with a fresh timestamp if
 * the base branch has picked up a newer one since. This module is the part of
 * that rule a computer can check. It has no opinion on the schema tag or
 * description in the filename, only the leading digits.
 *
 * Moved here from DevDogsUGA's `packages/repo-checks` (`check:migration-order`).
 */
import { execFileSync } from "node:child_process";

export const MIGRATIONS_DIR = "supabase/migrations";

/** The leading run of digits a migration filename starts with, or null for a
 * name that does not start with one. Such a name is not this check's problem
 * to diagnose, so it is skipped rather than thrown on. */
export function migrationTimestamp(filename: string): string | null {
  const match = /^(\d+)_/.exec(filename);
  return match ? (match[1] ?? null) : null;
}

/** The newest timestamp among a set of migration filenames, or null for an
 * empty set: the state the base branch was in before its first migration,
 * which cannot make anything "older" than it. */
export function latestMigrationTimestamp(
  filenames: readonly string[],
): string | null {
  let latest: string | null = null;
  for (const filename of filenames) {
    const ts = migrationTimestamp(filename);
    if (ts === null) continue;
    if (latest === null || ts > latest) latest = ts;
  }
  return latest;
}

export interface MigrationOrderViolation {
  filename: string;
  timestamp: string;
}

/**
 * Which of the newly added migration filenames sort before `baseLatest`.
 * Timestamps compare as strings on purpose: they are fixed-width
 * (`YYYYMMDDHHMMSS`), so lexicographic and numeric order agree, and a string
 * compare never has to worry about a value too large for a safe integer.
 */
export function findOutOfOrderMigrations(
  addedFilenames: readonly string[],
  baseLatest: string | null,
): MigrationOrderViolation[] {
  if (baseLatest === null) return [];

  const violations: MigrationOrderViolation[] = [];
  for (const filename of addedFilenames) {
    const timestamp = migrationTimestamp(filename);
    if (timestamp === null) continue;
    if (timestamp < baseLatest) violations.push({ filename, timestamp });
  }
  return violations;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function basenames(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => path.split("/").at(-1)!);
}

/** `baseRef` names nothing in the repo being checked. */
export class MigrationBaseError extends Error {}

export interface MigrationOrderReport {
  baseLatest: string | null;
  violations: MigrationOrderViolation[];
}

/**
 * Reads the two file lists from git and runs the pure check.
 *
 * The base branch's files come from its tree at `baseRef`, not from "what is
 * on disk before this PR", because a local checkout may already have this
 * PR's files merged into the working tree. The added files are the ones this
 * branch adds relative to the merge base (`--diff-filter=A`), so a rename or
 * an edit to an existing migration, both legitimate, does not trip this.
 */
export function checkMigrationOrder(
  root: string,
  baseRef: string,
): MigrationOrderReport {
  try {
    git(root, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
  } catch {
    throw new MigrationBaseError(
      `${baseRef} is not a commit in ${root}. Migrations live in DevDogsUGA, ` +
        "so the base is a ref of that checkout (a Backstage CI checkout has " +
        "only the pinned commit): pass --base <ref>, e.g. the previous " +
        "devdogsuga.lock SHA.",
    );
  }
  const baseFiles = basenames(
    git(root, ["ls-tree", "-r", "--name-only", baseRef, "--", MIGRATIONS_DIR]),
  );
  const addedFiles = basenames(
    git(root, [
      "diff",
      "--name-only",
      "--diff-filter=A",
      `${baseRef}...HEAD`,
      "--",
      MIGRATIONS_DIR,
    ]),
  );
  const baseLatest = latestMigrationTimestamp(baseFiles);
  return {
    baseLatest,
    violations: findOutOfOrderMigrations(addedFiles, baseLatest),
  };
}
