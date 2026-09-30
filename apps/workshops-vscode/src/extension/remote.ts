/**
 * Matching a git remote URL to `Owner/Name`, so the extension can find the
 * workshop clone among the open folders. People clone over https, ssh, with
 * or without `.git`, sometimes with a token or user in the URL; all of them
 * name the same repo. GitHub only; anything else is no match.
 */

const GITHUB_HOSTS: ReadonlySet<string> = new Set([
  "github.com",
  "www.github.com",
  "ssh.github.com",
]);

/** `owner/name` (original casing) from a GitHub remote URL, or null. */
export function parseGithubRemote(url: string): string | null {
  const trimmed = url.trim();
  let host: string;
  let path: string;

  // scp-like: git@github.com:Owner/Name.git
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(trimmed);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    host = scp[1]!;
    path = scp[2]!;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol))
      return null;
    host = parsed.hostname;
    path = parsed.pathname;
  }

  if (!GITHUB_HOSTS.has(host.toLowerCase())) return null;
  const parts = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return `${parts[0]}/${parts[1]}`;
}

/** Whether any of a clone's remote URLs is `repo` (case-insensitive). */
export function remotesMatchRepo(
  urls: readonly string[],
  repo: string,
): boolean {
  const wanted = repo.toLowerCase();
  return urls.some((url) => parseGithubRemote(url)?.toLowerCase() === wanted);
}
