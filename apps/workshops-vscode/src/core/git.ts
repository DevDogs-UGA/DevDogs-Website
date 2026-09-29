import { execFile } from "node:child_process";

/**
 * The only door to git. Everything here is plumbing that every git version
 * has: no `merge-tree --write-tree` (needs 2.38; Ubuntu 22.04 ships 2.34),
 * and no shell, so a ref or path can never be interpreted as anything but an
 * argument.
 */

/** Big enough for any blob a workshop repo holds; execFile's default is 1 MiB. */
const MAX_BUFFER = 256 * 1024 * 1024;

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args.join(" ")} failed (${exitCode ?? "no exit code"}): ${stderr.trim()}`);
    this.name = "GitError";
  }
}

export interface GitResult {
  /** Exit code; 0 unless the caller listed it in `okCodes`. */
  code: number;
  stdout: Buffer;
}

/**
 * Runs `git -C <cwd> <args>` and returns raw stdout. Exit codes listed in
 * `okCodes` resolve instead of throwing (`merge-base --is-ancestor` answers
 * "no" with 1).
 */
export function gitRaw(
  cwd: string,
  args: readonly string[],
  okCodes: readonly number[] = [],
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { encoding: "buffer", maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve({ code: 0, stdout });
        const code = typeof error.code === "number" ? error.code : null;
        if (code !== null && okCodes.includes(code)) return resolve({ code, stdout });
        reject(new GitError(args, code, stderr.toString("utf8")));
      },
    );
  });
}

/** `gitRaw`, decoded as UTF-8 text. */
export async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await gitRaw(cwd, args)).stdout.toString("utf8");
}

/**
 * The full ref for a tag name that came from outside (a link, a picker, a
 * tag listing). Callers pass this after `--end-of-options`, so even a name
 * beginning with `-` is a ref, never a flag.
 */
export function tagRef(name: string): string {
  return `refs/tags/${name}`;
}

/** Whether `ancestor` (a full ref) is reachable from `descendant`. */
export async function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const { code } = await gitRaw(
    cwd,
    ["merge-base", "--is-ancestor", "--end-of-options", ancestor, descendant],
    [1],
  );
  return code === 0;
}

/**
 * `git show <ref>:<path>` as bytes, or null when the path doesn't exist at
 * that ref. `--no-textconv` keeps a repo's diff drivers from rewriting it.
 */
export async function showFile(
  cwd: string,
  ref: string,
  path: string,
): Promise<Buffer | null> {
  try {
    const { stdout } = await gitRaw(cwd, [
      "show",
      "--no-textconv",
      "--end-of-options",
      `${ref}:${path}`,
    ]);
    return stdout;
  } catch (error) {
    // git says the same thing for a missing path at every version; anything
    // else (bad repo, unknown ref) is a real failure and still throws.
    if (
      error instanceof GitError &&
      /does not exist|exists on disk, but not in/.test(error.stderr)
    ) {
      return null;
    }
    throw error;
  }
}
