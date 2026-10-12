/**
 * Whether an approved candidate commit has been superseded, for the shared
 * deploy workflows' `require_latest` check.
 *
 * By default a candidate is superseded as soon as the default branch has moved:
 * the newer commit has its own run, and an approval that arrives late must not
 * deploy an old build. That is only true when every commit starts a run. A
 * workflow that runs on path-filtered pushes (Slides) has no run for an
 * unrelated commit, so "the newer commit has its own run" would be false and
 * the approved change would never deploy. For those, `--paths` lists the
 * workflow's own path filters, and the candidate is superseded only when a
 * newer commit changed one of them (that commit has its own run).
 *
 * Usage:
 *   node superseded.mjs --repo O/R --sha SHA --latest SHA [--paths "a/**\nb"]
 * with GH_TOKEN (or GITHUB_TOKEN) set when --paths is given. Exit 0 when the
 * candidate may deploy, 1 when it was superseded.
 */
import { createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

/**
 * A GitHub-Actions-style path filter as a regular expression: `**` crosses
 * directories, `*` does not.
 *
 * @param {string} pattern
 */
export function pathPattern(pattern) {
  const source = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // `**/` is any number of directories (or none); a bare `**` is anything.
    .replace(/\*\*\/|\*\*|\*|\?/g, (token) =>
      token === "**/"
        ? "(?:.*/)?"
        : token === "**"
          ? ".*"
          : token === "*"
            ? "[^/]*"
            : "[^/]",
    );
  return new RegExp(`^${source}$`);
}

/**
 * @param {string[]} files
 * @param {string[]} patterns
 * @returns {string[]} The files any pattern matches.
 */
export function matchingPaths(files, patterns) {
  const regexes = patterns.filter(Boolean).map(pathPattern);
  return files.filter((file) => regexes.some((re) => re.test(file)));
}

/**
 * @param {{
 *   sha: string,
 *   latest: string,
 *   patterns?: string[],
 *   compare?: () => Promise<{ status: string, files: string[], complete: boolean }>,
 * }} input
 * @returns {Promise<{ superseded: boolean, message: string }>}
 */
export async function evaluateSuperseded({
  sha,
  latest,
  patterns = [],
  compare,
}) {
  if (latest === sha) {
    return { superseded: false, message: `Candidate ${sha} is the head.` };
  }
  const wholesale = {
    superseded: true,
    message: `Candidate ${sha} was superseded by ${latest}. Nothing was changed; the newer commit has its own run.`,
  };
  if (patterns.filter(Boolean).length === 0 || !compare) return wholesale;
  const { status, files, complete } = await compare();
  if (status !== "ahead" || !complete) {
    // Not a straight line from the candidate, or too many files to read: say so.
    return wholesale;
  }
  const touched = matchingPaths(files, patterns);
  if (touched.length > 0) {
    return {
      superseded: true,
      message: `Candidate ${sha} was superseded by ${latest}, which changed ${touched.slice(0, 5).join(", ")}${touched.length > 5 ? ", ..." : ""}. Nothing was changed; that commit has its own run.`,
    };
  }
  return {
    superseded: false,
    message: `The default branch moved on to ${latest}, but nothing since ${sha} touches this deploy's paths, so no newer run exists for it. Deploying the approved candidate.`,
  };
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const repo = flag("--repo");
  const sha = flag("--sha");
  const latest = flag("--latest");
  const patterns = (flag("--paths") ?? "").split("\n").map((p) => p.trim());
  if (!repo || !sha || !latest) {
    process.stderr.write(
      "usage: superseded.mjs --repo O/R --sha SHA --latest SHA [--paths PATTERNS]\n",
    );
    process.exit(2);
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  const api = createApi({ token });
  const verdict = await evaluateSuperseded({
    sha,
    latest,
    patterns,
    compare: async () => {
      // `files` is paginated (100 a page) and the endpoint stops at 300.
      const base = `/repos/${repo}/compare/${sha}...${latest}`;
      let status = "";
      /** @type {string[]} */
      const files = [];
      for (let page = 1; page <= 3; page += 1) {
        const body = await api(`${base}?per_page=100&page=${page}`);
        status = body.status;
        const names = (body.files ?? []).map((f) => f.filename);
        files.push(...names);
        if (names.length < 100) break;
      }
      return { status, files, complete: files.length < 300 };
    },
  });
  process.stdout.write(`${verdict.message}\n`);
  if (verdict.superseded) {
    process.stdout.write(`::error::${verdict.message}\n`);
    process.exit(1);
  }
}
/* c8 ignore stop */
