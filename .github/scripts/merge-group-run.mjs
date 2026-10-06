/**
 * Finds the merge-queue CI run that already built this commit's artifacts.
 *
 * The merge queue builds every candidate commit in a `merge_group` CI run, and
 * when the queue merges it, `main` moves to that exact commit. The push run
 * that follows can therefore deploy the artifacts the queue already built and
 * checked instead of building again. An admin bypass push has no such run, and
 * the deploy builds for itself.
 *
 * A run qualifies only when all of these hold: event `merge_group`, head SHA
 * equal to this commit, the CI workflow, conclusion `success`, and a live
 * (unexpired) artifact `<tier>-<sha>` for every tier that will be deployed.
 *
 * Usage: GH_TOKEN=... node .github/scripts/merge-group-run.mjs \
 *   --repo OWNER/REPO --sha SHA --tiers staging,production
 * Prints the run id to stdout, or nothing when no run qualifies.
 */
import { pathToFileURL } from "node:url";
import { createApi } from "./github-api.mjs";

/** The workflow file whose merge-group runs build the artifacts. */
export const CI_WORKFLOW_PATH = ".github/workflows/ci.yaml";

/**
 * @param {{
 *   api: (path: string) => Promise<any>,
 *   repo: string,
 *   sha: string,
 *   tiers: string[],
 * }} options
 * @returns {Promise<string>} The run id, or "" when none qualifies.
 */
export async function findMergeGroupRun({ api, repo, sha, tiers }) {
  const runs = await api(
    `/repos/${repo}/actions/runs?event=merge_group&head_sha=${sha}&status=success&per_page=30`,
  );
  const candidates = (runs.workflow_runs ?? [])
    .filter(
      (/** @type {any} */ run) =>
        run.event === "merge_group" &&
        run.head_sha === sha &&
        run.conclusion === "success" &&
        String(run.path ?? "").split("@")[0] === CI_WORKFLOW_PATH,
    )
    .sort(
      (/** @type {any} */ a, /** @type {any} */ b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at),
    );

  for (const run of candidates) {
    const listing = await api(
      `/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
    );
    const live = new Set(
      (listing.artifacts ?? [])
        .filter((/** @type {any} */ a) => !a.expired)
        .map((/** @type {any} */ a) => a.name),
    );
    if (tiers.every((tier) => live.has(`${tier}-${sha}`))) {
      return String(run.id);
    }
  }
  return "";
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
  const tiers = (flag(argv, "--tiers") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const token = process.env.GH_TOKEN;
  if (!repo || !sha || tiers.length === 0 || !token) {
    console.error(
      "usage: GH_TOKEN=... merge-group-run.mjs --repo OWNER/REPO --sha SHA --tiers staging,production",
    );
    process.exit(2);
  }
  const id = await findMergeGroupRun({
    api: createApi({ token }),
    repo,
    sha,
    tiers,
  });
  process.stdout.write(id);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
