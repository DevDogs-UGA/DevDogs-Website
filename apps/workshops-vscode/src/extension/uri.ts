/**
 * The `vscode://devdogsuga.workshops/<action>?...` links. Docs pages will
 * build these (TASK-378), so the shape is fixed here and documented in the
 * README. This module only parses and validates: it never touches git or the
 * disk, and it has no vscode import, so it is tested like plain code.
 *
 *   /review?repo=<owner/name>&to=<tag>[&from=<tag>][&file=<path>][&session=<id>]
 *   /open?repo=<owner/name>&ref=<tag>&file=<path>[&lines=<a>-<b>]
 *
 * A link is untrusted input from any web page. So: the repo must be on the
 * allowlist, tags are only ever handed to git as `refs/tags/<name>` after
 * `--end-of-options` (see core `tagRef`), and paths are checked by
 * `resolveInside` before they touch the disk. Nothing here decides what gets
 * written; that waits for the attendee to press Accept.
 */

/** The only repositories a link may name, canonical casing. */
export const ALLOWED_REPOS = [
  "DevDogsUGA/Web-Workshops",
  "DevDogsUGA/Mobile-Workshops",
] as const;

/** The canonical `Owner/Name` for an allowlisted repo (any casing), else undefined. */
export function canonicalRepo(repo: string): string | undefined {
  const wanted = repo.trim().toLowerCase();
  return ALLOWED_REPOS.find((allowed) => allowed.toLowerCase() === wanted);
}

export interface ReviewLink {
  action: "review";
  repo: string;
  to: string;
  from: string | undefined;
  /** Limits the review to one file. Relative, forward-slashed. */
  file: string | undefined;
  /** Opaque; echoed back to the docs tab after Finish. */
  session: string | undefined;
}

export interface OpenLink {
  action: "open";
  repo: string;
  ref: string;
  file: string;
  /** 1-based, inclusive. */
  lines: { start: number; end: number } | undefined;
}

export type WorkshopLink = ReviewLink | OpenLink;

export type ParseResult =
  { ok: true; link: WorkshopLink } | { ok: false; reason: string };

const MAX_VALUE = 500;

/**
 * Splits a query string that VS Code has already percent-decoded (its
 * `Uri.query`): decoding again would corrupt a value containing `%`. First
 * value wins for a repeated key; `+` stays a plus.
 */
export function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? "" : pair.slice(eq + 1);
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

/** A tag or ref name from a link: non-empty, bounded, no control characters. */
function isPlausibleName(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return (
    value.length > 0 &&
    value.length <= MAX_VALUE &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

/** `12` or `12-20`, 1-based, ascending. */
export function parseLines(
  value: string,
): { start: number; end: number } | undefined {
  const match = /^(\d{1,7})(?:-(\d{1,7}))?$/.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end < start) return undefined;
  return { start, end };
}

/**
 * @param path  `Uri.path`, e.g. `/review`
 * @param query `Uri.query`, already decoded by VS Code
 */
export function parseWorkshopUri(path: string, query: string): ParseResult {
  const params = parseQuery(query);
  const fail = (reason: string): ParseResult => ({ ok: false, reason });
  const action = path.replace(/^\/+|\/+$/g, "");

  const repoParam = params.get("repo");
  if (repoParam === undefined)
    return fail("The link doesn't say which repository it is for.");
  const repo = canonicalRepo(repoParam);
  if (!repo)
    return fail(
      `"${repoParam.slice(0, 80)}" isn't a DevDogs workshop repository.`,
    );

  const name = (key: string): string | undefined | null => {
    const value = params.get(key);
    if (value === undefined || value === "") return undefined;
    return isPlausibleName(value) ? value : null;
  };
  const optionalText = (key: string): string | undefined | null => {
    const value = params.get(key);
    if (value === undefined || value === "") return undefined;
    return value.length <= MAX_VALUE && !/[\x00]/.test(value) ? value : null;
  };

  if (action === "review") {
    const to = name("to");
    if (!to) return fail("The link doesn't name the step to review.");
    const from = name("from");
    const file = optionalText("file");
    const session = optionalText("session");
    if (from === null) return fail("The link's starting step isn't valid.");
    if (file === null) return fail("The link's file isn't valid.");
    if (session === null) return fail("The link's session isn't valid.");
    return {
      ok: true,
      link: { action: "review", repo, to, from, file, session },
    };
  }

  if (action === "open") {
    const ref = name("ref");
    if (!ref)
      return fail("The link doesn't name the step to open the file at.");
    const file = optionalText("file");
    if (!file) return fail("The link doesn't name a file.");
    const linesParam = params.get("lines");
    let lines: { start: number; end: number } | undefined;
    if (linesParam !== undefined && linesParam !== "") {
      lines = parseLines(linesParam);
      if (!lines) return fail("The link's line range isn't valid.");
    }
    return { ok: true, link: { action: "open", repo, ref, file, lines } };
  }

  return fail(`Unknown action "${action.slice(0, 40)}".`);
}
