/**
 * Did `supabase/config.toml` change since production LAST DEPLOYED?
 *
 * For the product repositories (DogDays, DogPack), whose deploy pushes the
 * Supabase configuration only when it changed. They used to diff against
 * `github.event.before`, the previous commit. That loses a change: commit A
 * edits config.toml, its production run is superseded (require_latest) or
 * cancelled because commit B landed, and B's diff against A is empty, so
 * production never gets A's configuration. This compares against the newest
 * commit whose production database apply SUCCEEDED, the way deploy-needed.mjs
 * compares DevDogsUGA's tiers, so a change nobody deployed stays pending.
 *
 * "Deployed" = the run's `production-database(-apply) / apply` job succeeded
 * (an apply that was skipped, failed or never ran does not count). That job
 * either pushed the configuration or was told it had nothing to push, so the
 * commit is current for config.
 *
 * Fails OPEN: no earlier deploy found, a commit git cannot reach, any API
 * error: the answer is `true` (push), because a redundant push is harmless and
 * a missed one is the failure.
 *
 * Usage: GH_TOKEN=... node config-changed.mjs --repo OWNER/REPO --sha SHA
 *   [--workflow ci.yaml] [--path supabase/config.toml]
 * Prints `config=true|false` (for $GITHUB_OUTPUT) and the reason on stderr.
 */
import { execFileSync } from "node:child_process";
import { createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

/** The apply job of the production database block, with or without the approval flow. */
export const APPLY_JOB = /(^|\/ )production-database(-apply)? \/ apply$/;

/**
 * @param {any[]} jobs  One run's jobs.
 */
export function appliedInProduction(jobs) {
  return jobs.some(
    (job) => APPLY_JOB.test(String(job.name)) && job.conclusion === "success",
  );
}

/**
 * The newest commit on `main` whose production apply succeeded, or "".
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, sha: string, workflow?: string }} options
 */
export async function lastApplied({ api, repo, sha, workflow = "ci.yaml" }) {
  const listing = await api(
    `/repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=push&per_page=30`,
  );
  for (const run of listing.workflow_runs ?? []) {
    if (run.head_sha === sha) continue;
    const { jobs } = await api(
      `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    if (appliedInProduction(jobs ?? [])) return String(run.head_sha);
  }
  return "";
}

/**
 * @param {{ api: (path: string) => Promise<any>, repo: string, sha: string, workflow?: string, path?: string, changedSince: (from: string, to: string, path: string) => boolean | null }} options
 *   `changedSince` returns whether `path` differs between the commits, or null
 *   when git cannot tell.
 * @returns {Promise<{ config: boolean, reason: string }>}
 */
export async function configChanged({
  api,
  repo,
  sha,
  workflow,
  path = "supabase/config.toml",
  changedSince,
}) {
  let last = "";
  try {
    last = await lastApplied({ api, repo, sha, workflow });
  } catch (err) {
    return {
      config: true,
      reason: `could not tell (${err instanceof Error ? err.message : err})`,
    };
  }
  if (!last)
    return { config: true, reason: "no earlier production apply found" };
  const changed = changedSince(last, sha, path);
  if (changed === null) {
    return {
      config: true,
      reason: `cannot diff from the last production apply (${last.slice(0, 7)})`,
    };
  }
  return {
    config: changed,
    reason: `${path} ${changed ? "changed" : "is unchanged"} since the last production apply (${last.slice(0, 7)})`,
  };
}

/** @param {string} from @param {string} to @param {string} path */
function gitChanged(from, to, path) {
  try {
    execFileSync("git", ["cat-file", "-e", `${from}^{commit}`], {
      stdio: "ignore",
    });
    execFileSync("git", ["diff", "--quiet", from, to, "--", path], {
      stdio: "ignore",
    });
    return false;
  } catch (err) {
    // `git diff --quiet` exits 1 on a difference; anything else is unknown.
    return /** @type {any} */ (err)?.status === 1 ? true : null;
  }
}

/** @param {string[]} argv @param {string} name */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = flag(argv, "--repo");
  const sha = flag(argv, "--sha");
  const token = process.env.GH_TOKEN;
  if (!repo || !sha || !token) {
    console.error(
      "usage: GH_TOKEN=... config-changed.mjs --repo OWNER/REPO --sha SHA [--workflow ci.yaml] [--path supabase/config.toml]",
    );
    process.exit(2);
  }
  const result = await configChanged({
    api: createApi({ token }),
    repo,
    sha,
    workflow: flag(argv, "--workflow"),
    path: flag(argv, "--path"),
    changedSince: gitChanged,
  });
  console.error(`config: ${result.config}; ${result.reason}`);
  process.stdout.write(`config=${result.config}\n`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    // Fail open.
    console.error(
      `could not tell (${err instanceof Error ? err.message : err})`,
    );
    process.stdout.write("config=true\n");
  });
}
