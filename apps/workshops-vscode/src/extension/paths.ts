import { isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";

/**
 * Keeps a path from a link inside the clone. Links are untrusted, so a
 * `file=` like `../../.ssh/config` or `/etc/passwd` must never resolve
 * outside the repo. Symlinks inside the clone are the repo's own business and
 * are not chased here.
 */

/**
 * The absolute path for `file` under `root`, or null if it is empty, absolute
 * (POSIX or Windows), contains NUL, climbs out of `root`, or points into
 * `.git`. Backslashes count as separators so a Windows-style `..\..\x` fails
 * on every platform.
 */
export function resolveInside(root: string, file: string): string | null {
  if (file === "" || file.includes("\0")) return null;
  const unified = file.replace(/\\/g, "/");
  if (
    posix.isAbsolute(unified) ||
    win32.isAbsolute(unified) ||
    isAbsolute(file)
  )
    return null;

  const target = resolve(root, ...unified.split("/"));
  const rel = relative(resolve(root), target);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  )
    return null;
  if (rel.split(sep)[0] === ".git") return null;
  return target;
}

/** The repo-relative, forward-slashed form of a file that passed `resolveInside`. */
export function repoRelative(root: string, file: string): string | null {
  const target = resolveInside(root, file);
  if (target === null) return null;
  return relative(resolve(root), target).split(sep).join("/");
}
