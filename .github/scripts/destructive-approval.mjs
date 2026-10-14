/**
 * The deploy-time half of the destructive gate: refuse a destructive plan the
 * pull request did not approve.
 *
 * A change that drops or rewrites data is approved ON THE PULL REQUEST: a
 * `devops` member reads the SQL and applies the `allow-destructive` label
 * (destructive-label.mjs; destructive-gate.yaml clears it on every push). The
 * deploy asks nobody a second time. It only checks that the approval is real
 * and that it covers what is about to run:
 *
 *   1. a merged pull request produced this commit, and carries the label,
 *      applied by a devops member (a direct push by an admin bypass has no
 *      pull request, so a destructive plan from one is refused);
 *   2. every destructive statement in the deploy's own plan (computed against
 *      the real database) also appears in the plan the pull request showed:
 *      the `db-check` artifact of the merge queue run for this commit. A
 *      statement only the deploy sees means the database changed since the
 *      review, so the review does not cover it.
 *
 * Nothing destructive in the plan: passes without asking anything.
 *
 * The plan's reasons are read from the files db-plan.mjs writes
 * (`migrations-plan.json`, `schema-plan.json`) in --plan-dir; the pull
 * request's from `schema-change.json` and `migrations-change.json` in the
 * downloaded `db-check` artifact. On success the verdict is written to
 * `<plan-dir>/destructive-approval.json` for the approval summary.
 *
 * Usage:
 *   GH_TOKEN=... node destructive-approval.mjs --repo OWNER/REPO --sha SHA --plan-dir DIR
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { producingPulls } from "./approval-gate.mjs";
import { isDevops, labelState } from "./destructive-label.mjs";
import { apiAll, createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

/** @typedef {{ source: string, kind: string, statement: string }} Reason */

/** @param {string} statement */
const squash = (statement) => String(statement).replace(/\s+/g, " ").trim();

/** @param {{ kind: string, statement: string }} reason */
export const reasonKey = (reason) =>
  `${reason.kind}\u0000${squash(reason.statement)}`;

/**
 * @param {string} path
 * @returns {any | undefined}
 */
function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

/**
 * Destructive reasons from a `{ classified: [{ file, reasons }] }` file.
 *
 * @param {any} json
 * @returns {Reason[]}
 */
function fromClassified(json) {
  return (json?.classified ?? []).flatMap((/** @type {any} */ c) =>
    (c.reasons ?? []).map((/** @type {any} */ r) => ({
      source: c.file,
      kind: r.kind,
      statement: r.statement,
    })),
  );
}

/**
 * @param {any} json  A schema-plan.json or schema-change.json.
 * @returns {Reason[]}
 */
function fromSchema(json) {
  return (json?.classification?.reasons ?? []).map((/** @type {any} */ r) => ({
    source: "schema",
    kind: r.kind,
    statement: r.statement,
  }));
}

/**
 * The destructive statements the deploy's plan would run.
 *
 * @param {string} planDir
 * @returns {Reason[]}
 */
export function deployReasons(planDir) {
  return [
    ...fromClassified(readJson(join(planDir, "migrations-plan.json"))),
    ...fromSchema(readJson(join(planDir, "schema-plan.json"))),
  ];
}

/**
 * The destructive statements the pull request showed its reviewer.
 *
 * @param {string} checkDir  The downloaded `db-check` artifact.
 * @returns {Reason[]}
 */
export function pullRequestReasons(checkDir) {
  return [
    ...fromClassified(readJson(join(checkDir, "migrations-change.json"))),
    ...fromSchema(readJson(join(checkDir, "schema-change.json"))),
  ];
}

/**
 * The deploy's destructive statements that the pull request's plan did not
 * contain.
 *
 * @param {Reason[]} deploy
 * @param {Reason[]} shown
 */
export function uncovered(deploy, shown) {
  const known = new Set(shown.map(reasonKey));
  return deploy.filter((reason) => !known.has(reasonKey(reason)));
}

/**
 * The merged pull request whose `allow-destructive` label a devops member
 * applied.
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, sha: string }} options
 * @returns {Promise<{ pr?: number, actor?: string, problems: string[] }>}
 */
export async function findApproval({ api, repo, sha }) {
  const pulls = producingPulls(
    await apiAll(api, `/repos/${repo}/commits/${sha}/pulls`),
    sha,
  );
  if (pulls.length === 0) {
    return {
      problems: [
        `No merged pull request produced ${sha} (a direct push), so nothing ` +
          `approved this destructive plan.`,
      ],
    };
  }
  /** @type {string[]} */
  const problems = [];
  for (const pull of pulls) {
    const timeline = await apiAll(
      api,
      `/repos/${repo}/issues/${pull.number}/timeline`,
    );
    const state = labelState(timeline);
    if (!state.present) {
      problems.push(`#${pull.number} does not carry allow-destructive.`);
    } else if (!state.actor || !(await isDevops(api, repo, state.actor))) {
      problems.push(
        `#${pull.number} carries allow-destructive from ${state.actor ?? "an unknown user"}, who is not a devops member.`,
      );
    } else {
      return { pr: pull.number, actor: state.actor, problems: [] };
    }
  }
  return { problems };
}

/**
 * The merge queue run that checked this commit and kept its `db-check`
 * artifact: its id, or "".
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, sha: string }} options
 */
export async function findCheckRun({ api, repo, sha }) {
  const runs = await api(
    `/repos/${repo}/actions/runs?event=merge_group&head_sha=${sha}&per_page=30`,
  );
  for (const run of runs.workflow_runs ?? []) {
    if (run.head_sha !== sha) continue;
    const listing = await api(
      `/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
    );
    const found = (listing.artifacts ?? []).some(
      (/** @type {any} */ a) => a.name === "db-check" && !a.expired,
    );
    if (found) return String(run.id);
  }
  return "";
}

/**
 * @param {{
 *   api: (path: string) => Promise<any>,
 *   repo: string,
 *   sha: string,
 *   planDir: string,
 *   download: (runId: string) => string,
 * }} options  `download` fetches the db-check artifact and returns its directory.
 * @returns {Promise<{ pass: boolean, notes: string[], failures: string[], approval?: { pr: number, actor: string, statements: number } }>}
 */
export async function evaluate({ api, repo, sha, planDir, download }) {
  const deploy = deployReasons(planDir);
  if (deploy.length === 0) {
    return {
      pass: true,
      notes: ["The plan is not destructive."],
      failures: [],
    };
  }
  const fix =
    "Nothing was changed. Open a pull request that carries the change, have a devops member read its db-check summary and apply allow-destructive, and merge it.";
  const found = await findApproval({ api, repo, sha });
  if (found.pr === undefined || found.actor === undefined) {
    return {
      pass: false,
      notes: [],
      failures: [
        `The plan is destructive (${deploy.length} statement(s)) and the pull request did not approve it. ${found.problems.join(" ")} ${fix}`,
      ],
    };
  }
  const runId = await findCheckRun({ api, repo, sha });
  if (!runId) {
    return {
      pass: false,
      notes: [],
      failures: [
        `The plan is destructive and #${found.pr} is labelled, but no merge queue run kept a db-check artifact for ${sha}, so the plan cannot be compared with what #${found.pr} showed. ${fix}`,
      ],
    };
  }
  const missing = uncovered(deploy, pullRequestReasons(download(runId)));
  if (missing.length > 0) {
    return {
      pass: false,
      notes: [],
      failures: [
        `The plan differs from what #${found.pr} showed its reviewer: ${missing.length} destructive statement(s) are new (the database changed since the review):\n` +
          missing
            .map((r) => `  - ${r.source}: ${r.kind}: ${squash(r.statement)}`)
            .join("\n") +
          `\n${fix}`,
      ],
    };
  }
  return {
    pass: true,
    notes: [
      `The destructive plan (${deploy.length} statement(s)) was approved on #${found.pr}: allow-destructive applied by @${found.actor}, and it matches the plan that pull request showed.`,
    ],
    failures: [],
    approval: { pr: found.pr, actor: found.actor, statements: deploy.length },
  };
}

/** @param {string[]} argv @param {string} name */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/** @param {string} repo @param {string} runId */
function ghDownload(repo, runId) {
  const dir = mkdtempSync(join(tmpdir(), "db-check-"));
  execFileSync(
    "gh",
    [
      "run",
      "download",
      runId,
      "--repo",
      repo,
      "--name",
      "db-check",
      "--dir",
      dir,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return dir;
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = flag(argv, "--repo");
  const sha = flag(argv, "--sha");
  const planDir = flag(argv, "--plan-dir");
  const token = process.env.GH_TOKEN;
  if (!repo || !sha || !planDir || !token) {
    console.error(
      "usage: GH_TOKEN=... destructive-approval.mjs --repo OWNER/REPO --sha SHA --plan-dir DIR",
    );
    process.exit(2);
  }
  const result = await evaluate({
    api: createApi({ token }),
    repo,
    sha,
    planDir,
    download: (runId) => ghDownload(repo, runId),
  });
  for (const note of result.notes) console.log(note);
  for (const failure of result.failures) console.error(`::error::${failure}`);
  if (result.approval) {
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, "destructive-approval.json"),
      `${JSON.stringify(result.approval)}\n`,
    );
  }
  if (!result.pass) process.exit(1);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
