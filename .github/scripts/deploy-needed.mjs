/**
 * Whether a push changes anything a tier ships, so the deploy can skip a tier
 * (and its approval) when it would redeploy what is already live.
 *
 * Compared against the commit LAST DEPLOYED to the tier, not the previous
 * commit: a deployable change whose deploy failed, was rejected or was
 * superseded is still undeployed, and a docs-only push after it must carry it
 * out rather than skip. "Last deployed" is read from this workflow's own runs
 * on `main`, newest first:
 *
 *   staging     the `staging-platform` and `staging-schedule-builder` calls of
 *               deploy-worker.yaml both succeeded (the jobs of a called
 *               workflow are named `<caller job> / <job>`)
 *   production  the `production-platform` and `production-schedule-builder`
 *               calls both succeeded AND their traffic switch ran
 *
 * Runs from before the shared workflows (jobs named `staging-deploy (…)` and
 * `production`) are still read, so the first run after the change does not
 * redeploy a commit the old flow had already shipped.
 *
 * ⚠️ Fails OPEN. No previous deploy found, a diff git cannot compute, any API
 * error: the tier deploys. Skipping is the optimisation; a missed deploy is
 * the failure.
 *
 * ⚠️ The inert list is an ALLOWLIST of paths known not to reach a deployed
 * artifact. Anything not on it deploys, so a new directory deploys until
 * someone decides otherwise. schedule-builder, supabase/ (migrations, seeds,
 * config) and docs/ are not on it: they all reach a tier.
 *
 * Usage: GH_TOKEN=... node .github/scripts/deploy-needed.mjs \
 *   --repo OWNER/REPO --sha SHA --tiers staging,production
 * Prints `staging=true|false` and `production=true|false` lines (for
 * $GITHUB_OUTPUT), one per tier given, and the reasons on stderr.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createApi } from "./github-api.mjs";

/** Paths (prefixes ending in `/`, or exact files) that ship in no Worker. */
const INERT_PREFIXES = [
  "apps/slides/",
  "apps/workshops-vscode/",
  "competitions/",
  // The officer CLIs. Deploy jobs build them from this commit, so a change
  // here changes HOW the next deploy runs, not what is live.
  "packages/backstage/",
  "packages/cli-core/",
  "packages/devtools/",
  "packages/newsletter-cli/",
  // The deploy's own scripts. Like the CLIs, they change how the next deploy
  // runs, not what it ships.
  ".github/scripts/",
  ".github/ISSUE_TEMPLATE/",
  ".vscode/",
  // Flutter, built and distributed on its own.
  "apps/study-group-finder/",
];
const INERT_FILES = new Set([
  "CUTOVER.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "renovate.json",
  "renovate.json5",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "patches/patches.json",
  ".github/workflows/publish.yaml",
  // Orchestration only: the artifacts come from build-artifacts.yaml and the
  // composite actions, which stay shipped because they shape the build.
  ".github/workflows/ci.yaml",
  ".github/workflows/deploy.yaml",
  ".github/workflows/deploy-database.yaml",
  ".github/workflows/deploy-worker.yaml",
  ".github/workflows/database-pr.yaml",
  ".github/workflows/destructive-gate.yaml",
  ".github/workflows/smoke.yaml",
  "renovate/default.json",
  ".github/CODEOWNERS",
  ".github/workflows/slides.yaml",
  ".github/workflows/workshops-vscode.yaml",
]);
const INERT_PATTERNS = [
  /(^|\/)README\.md$/,
  // Tests never ship.
  /\.(test|db-test)\.(ts|tsx|mjs|js)$/,
  // Repo maintenance scripts: publishing, the patch audit, the script-name
  // check. The deploy's own scripts live in .github/scripts.
  /^scripts\/(publish-|patch-|check-scripts)/,
];

/** @param {string} path */
export function isInert(path) {
  return (
    INERT_FILES.has(path) ||
    INERT_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    INERT_PATTERNS.some((pattern) => pattern.test(path))
  );
}

/** Steps of the pre-shared-workflow production job that only run when it deploys. */
const LEGACY_PRODUCTION_DEPLOY_STEPS = [
  "Deploy and verify platform",
  "Deploy and verify schedule-builder",
];

/** The step of deploy-worker.yaml that gives the new version traffic. */
const SWITCH_STEP = "Switch traffic to the new version";

/** The Workers a tier ships, as the caller jobs in deploy.yaml name them. */
const WORKER_CALLS = {
  staging: ["staging-platform", "staging-schedule-builder"],
  production: ["production-platform", "production-schedule-builder"],
};

/**
 * @param {any[]} jobs
 * @param {string} call  A caller job id in deploy.yaml.
 */
function callSucceeded(jobs, call) {
  const job = jobs.find((j) => j.name === `deploy / ${call} / deploy`);
  if (!job || job.conclusion !== "success") return false;
  return (job.steps ?? []).some(
    (/** @type {any} */ step) =>
      step.name === SWITCH_STEP && step.conclusion === "success",
  );
}

/**
 * @param {any[]} jobs  One run's jobs.
 * @param {string} tier
 */
export function runDeployed(jobs, tier) {
  const calls = WORKER_CALLS[/** @type {"staging" | "production"} */ (tier)];
  if (calls?.every((call) => callSucceeded(jobs, call))) return true;
  return legacyRunDeployed(jobs, tier);
}

/**
 * @param {any[]} jobs
 * @param {string} tier
 */
function legacyRunDeployed(jobs, tier) {
  if (tier === "staging") {
    const deploys = jobs.filter((job) =>
      String(job.name).startsWith("deploy / staging-deploy"),
    );
    return (
      deploys.length > 0 && deploys.every((job) => job.conclusion === "success")
    );
  }
  const job = jobs.find((j) => j.name === "deploy / production");
  if (!job || job.conclusion !== "success") return false;
  return LEGACY_PRODUCTION_DEPLOY_STEPS.every((name) =>
    (job.steps ?? []).some(
      (/** @type {any} */ step) =>
        step.name === name && step.conclusion === "success",
    ),
  );
}

/**
 * The newest commit on `main` deployed to `tier` by this repository's CI, or
 * "" when none of the recent runs did.
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, tier: string, before: string }} options
 *   `before`: this run's own SHA, skipped (its deploy has not happened yet).
 */
export async function lastDeployed({ api, repo, tier, before }) {
  const listing = await api(
    `/repos/${repo}/actions/workflows/ci.yaml/runs?branch=main&event=push&per_page=30`,
  );
  for (const run of listing.workflow_runs ?? []) {
    if (run.head_sha === before) continue;
    const { jobs } = await api(
      `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    if (runDeployed(jobs ?? [], tier)) return String(run.head_sha);
  }
  return "";
}

/**
 * @param {string[]} changed  Paths changed since the tier's last deploy.
 * @returns {string[]} The ones that ship.
 */
export function deployable(changed) {
  return changed.filter((path) => !isInert(path));
}

/** @param {string} from @param {string} to @returns {string[] | null} */
function diff(from, to) {
  try {
    return execFileSync("git", ["diff", "--name-only", from, to], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
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
  const tiers = (flag(argv, "--tiers") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const token = process.env.GH_TOKEN;
  if (!repo || !sha || tiers.length === 0 || !token) {
    console.error(
      "usage: GH_TOKEN=... deploy-needed.mjs --repo OWNER/REPO --sha SHA --tiers staging,production",
    );
    process.exit(2);
  }
  const api = createApi({ token });

  for (const tier of tiers) {
    let needed = true;
    let reason;
    try {
      const last = await lastDeployed({ api, repo, tier, before: sha });
      const changed = last ? diff(last, sha) : null;
      if (!last) {
        reason = "no earlier deploy found";
      } else if (changed === null) {
        reason = `cannot diff from the last deploy (${last.slice(0, 7)})`;
      } else {
        const shipped = deployable(changed);
        needed = shipped.length > 0;
        reason = needed
          ? `${shipped.length} shipped file(s) changed since ${last.slice(0, 7)}, e.g. ${shipped.slice(0, 3).join(", ")}`
          : `nothing shipped changed since ${last.slice(0, 7)} (${changed.length} inert file(s))`;
      }
    } catch (err) {
      reason = `could not tell (${err instanceof Error ? err.message : err})`;
    }
    console.error(`${tier}: ${needed ? "deploy" : "skip"}; ${reason}`);
    process.stdout.write(`${tier}=${needed}\n`);
  }
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
