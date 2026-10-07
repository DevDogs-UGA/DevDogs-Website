import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approversOf,
  enqueuerOf,
  evaluateGate,
  producingPulls,
} from "./approval-gate.mjs";
import { apiAll, createApi } from "./github-api.mjs";
import {
  deployable,
  isInert,
  lastDeployed,
  runDeployed,
} from "./deploy-needed.mjs";
import { findMergeGroupRun } from "./merge-group-run.mjs";

const REPO = "DevDogsUGA/Backstage";
const SHA = "a".repeat(40);
const RUN = "4242";

/** A fake `api` answering from a path -> body map, ignoring the query string. */
function fakeApi(routes) {
  const seen = [];
  const api = async (path) => {
    seen.push(path);
    const [bare] = path.split("?");
    if (!(bare in routes)) throw new Error(`unexpected GET ${path}`);
    return routes[bare];
  };
  api.seen = seen;
  return api;
}

const approval = (login, environment = "production", state = "approved") => ({
  state,
  user: { login },
  environments: [{ name: environment }],
});

const queued = (login) => ({ event: "added_to_merge_queue", actor: { login } });

function routes({ approvals, author = "devdogs-deploy[bot]", enqueuer }) {
  return {
    [`/repos/${REPO}/commits/${SHA}/pulls`]: [
      {
        number: 7,
        merge_commit_sha: SHA,
        merged_at: "2026-10-06T00:00:00Z",
        user: { login: author },
      },
    ],
    [`/repos/${REPO}/issues/7/timeline`]: [
      { event: "commented" },
      ...(enqueuer ? [queued(enqueuer)] : []),
    ],
    [`/repos/${REPO}/actions/runs/${RUN}/approvals`]: approvals,
  };
}

const gate = (r) =>
  evaluateGate({ api: fakeApi(r), repo: REPO, runId: RUN, sha: SHA });

test("approversOf keeps approvals of the named environment only", () => {
  assert.deepEqual(
    approversOf(
      [
        approval("ann"),
        approval("bob", "staging"),
        approval("cy", "production", "rejected"),
        approval("ann"),
      ],
      "production",
    ),
    ["ann"],
  );
});

test("producingPulls prefers the exact merge commit, then any merged PR", () => {
  const exact = { number: 1, merge_commit_sha: SHA, merged_at: "x" };
  const other = { number: 2, merge_commit_sha: "b".repeat(40), merged_at: "x" };
  const open = { number: 3, merge_commit_sha: null, merged_at: null };
  assert.deepEqual(producingPulls([other, exact, open], SHA), [exact]);
  assert.deepEqual(producingPulls([other, open], SHA), [other]);
  assert.deepEqual(producingPulls([open], SHA), []);
});

test("enqueuerOf takes the last merge-queue event", () => {
  assert.equal(
    enqueuerOf([queued("ann"), { event: "x" }, queued("bob")]),
    "bob",
  );
  assert.equal(enqueuerOf([{ event: "commented" }]), undefined);
});

test("passes when an approver is neither author nor enqueuer", async () => {
  const result = await gate(
    routes({ approvals: [approval("cy")], enqueuer: "ann" }),
  );
  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test("fails when the enqueuer approved a deploy PR the App authored", async () => {
  const result = await gate(
    routes({ approvals: [approval("Ann")], enqueuer: "ann" }),
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /Ann approved production but queued #7/);
});

test("fails when the PR author approved, even beside a valid approver", async () => {
  const result = await gate(
    routes({
      approvals: [approval("cy"), approval("dev")],
      author: "dev",
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /dev approved production but authored #7/);
});

test("names both reasons for someone who authored and queued", async () => {
  const result = await gate(
    routes({ approvals: [approval("dev")], author: "dev", enqueuer: "dev" }),
  );
  assert.match(result.failures[0], /authored #7 and queued #7/);
});

test("a rejection or another environment's approval is not an approval", async () => {
  const result = await gate(
    routes({
      approvals: [
        approval("cy", "production", "rejected"),
        approval("ann", "staging"),
      ],
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /No approval of the production environment/);
});

test("a direct push has no PR, and the native review rule is the gate", async () => {
  const api = fakeApi({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [] });
  const result = await evaluateGate({ api, repo: REPO, runId: RUN, sha: SHA });
  assert.equal(result.pass, true);
  assert.match(result.notes[0], /direct push/);
  assert.equal(api.seen.length, 1);
});

test("a PR with no merge-queue event still bars its author", async () => {
  const result = await gate(
    routes({
      approvals: [approval("devdogs-deploy[bot]")],
      enqueuer: undefined,
    }),
  );
  assert.equal(result.pass, false);
  assert.ok(result.notes.some((n) => /no merge-queue event/.test(n)));
});

test("apiAll follows pages until one is short", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => i),
    Array.from({ length: 3 }, (_, i) => 100 + i),
  ];
  const seen = [];
  const all = await apiAll(async (path) => {
    seen.push(path);
    return pages[Number(/&page=(\d+)/.exec(path)[1]) - 1];
  }, "/x");
  assert.equal(all.length, 103);
  assert.equal(seen.length, 2);
});

test("createApi sends the token and surfaces a failed response", async () => {
  let sent;
  const ok = createApi({
    token: "t",
    baseUrl: "https://example.test",
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return { ok: true, json: async () => ({ a: 1 }) };
    },
  });
  assert.deepEqual(await ok("/p"), { a: 1 });
  assert.equal(sent.url, "https://example.test/p");
  assert.equal(sent.init.headers.authorization, "Bearer t");

  const bad = createApi({
    token: "t",
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      text: async () => "nope",
    }),
  });
  await assert.rejects(bad("/p"), /GET \/p failed: 404 nope/);
});

// ── merge-group-run ──────────────────────────────────────────────────────────

const run = (id, over = {}) => ({
  id,
  event: "merge_group",
  head_sha: SHA,
  conclusion: "success",
  path: ".github/workflows/ci.yaml",
  created_at: `2026-10-06T00:00:0${id % 10}Z`,
  ...over,
});

const artifacts = (...names) => ({
  artifacts: names.map((name) => ({ name, expired: false })),
});

const runsPath = `/repos/${REPO}/actions/runs`;
const both = [`staging-${SHA}`, `production-${SHA}`];

test("finds the newest merge-group run that has every tier's artifact", async () => {
  const api = fakeApi({
    [runsPath]: { workflow_runs: [run(1), run(2)] },
    [`${runsPath}/1/artifacts`]: artifacts(...both),
    [`${runsPath}/2/artifacts`]: artifacts(...both),
  });
  assert.equal(
    await findMergeGroupRun({
      api,
      repo: REPO,
      sha: SHA,
      tiers: ["staging", "production"],
    }),
    "2",
  );
});

test("skips runs missing an artifact, expired, other workflows or failed", async () => {
  const api = fakeApi({
    [runsPath]: {
      workflow_runs: [
        run(1, { path: ".github/workflows/publish.yaml" }),
        run(2, { conclusion: "failure" }),
        run(3, { head_sha: "b".repeat(40) }),
        run(4),
        run(5),
      ],
    },
    [`${runsPath}/4/artifacts`]: artifacts(`staging-${SHA}`),
    [`${runsPath}/5/artifacts`]: {
      artifacts: both.map((name) => ({ name, expired: true })),
    },
  });
  assert.equal(
    await findMergeGroupRun({
      api,
      repo: REPO,
      sha: SHA,
      tiers: ["staging", "production"],
    }),
    "",
  );
});

test("only the deployed tiers need artifacts", async () => {
  const api = fakeApi({
    [runsPath]: { workflow_runs: [run(4)] },
    [`${runsPath}/4/artifacts`]: artifacts(`staging-${SHA}`),
  });
  assert.equal(
    await findMergeGroupRun({ api, repo: REPO, sha: SHA, tiers: ["staging"] }),
    "4",
  );
});

test("a ref suffix on the workflow path still matches", async () => {
  const api = fakeApi({
    [runsPath]: {
      workflow_runs: [
        run(6, { path: ".github/workflows/ci.yaml@refs/heads/main" }),
      ],
    },
    [`${runsPath}/6/artifacts`]: artifacts(`staging-${SHA}`),
  });
  assert.equal(
    await findMergeGroupRun({ api, repo: REPO, sha: SHA, tiers: ["staging"] }),
    "6",
  );
});

// --- deploy-needed ---------------------------------------------------------

test("isInert: docs, tests, slides and the CLIs ship nothing", () => {
  for (const path of [
    "README.md",
    "packages/events/README.md",
    "CUTOVER.md",
    "apps/slides/workshops/web/slides.md",
    "competitions/fall-2026/brief.md",
    "packages/backstage/src/env/commands.ts",
    "packages/devtools/src/check/env.ts",
    "apps/platform/src/lib/docsTree.test.ts",
    "scripts/publish-changed-packages.mjs",
    ".github/workflows/publish.yaml",
    ".github/workflows/deploy.yaml",
    ".github/workflows/ci.yaml",
    ".github/scripts/deploy-needed.mjs",
  ]) {
    assert.equal(isInert(path), true, path);
  }
});

test("isInert: the platform, its packages, the pin and the deploy ship", () => {
  for (const path of [
    "apps/platform/next.config.ts",
    "apps/platform/src/env.ts",
    "packages/events/src/data/meetings.json",
    "packages/email/src/TeamInvite.tsx",
    "devdogsuga.lock",
    "workers.json",
    "pnpm-lock.yaml",
    ".github/workflows/build-artifacts.yaml",
    ".github/actions/setup-workspace/action.yml",
    "something-new/file.ts",
  ]) {
    assert.equal(isInert(path), false, path);
  }
});

test("deployable keeps only shipped paths", () => {
  assert.deepEqual(deployable(["README.md", "apps/platform/x.ts"]), [
    "apps/platform/x.ts",
  ]);
  assert.deepEqual(deployable(["README.md"]), []);
});

const job = (name, conclusion, steps) => ({ name, conclusion, steps });
const ok = (name) => ({ name, conclusion: "success" });

test("runDeployed: staging needs every staging-deploy job to succeed", () => {
  const both = [
    job("deploy / staging-deploy (platform, apps/platform, x)", "success"),
    job("deploy / staging-deploy (schedule-builder, d, y)", "success"),
  ];
  assert.equal(runDeployed(both, "staging"), true);
  both[1].conclusion = "failure";
  assert.equal(runDeployed(both, "staging"), false);
  assert.equal(runDeployed([job("validate", "success")], "staging"), false);
});

test("runDeployed: a superseded production job deployed nothing", () => {
  const deployed = job("deploy / production", "success", [
    ok("Deploy and verify platform"),
    ok("Deploy and verify schedule-builder"),
  ]);
  assert.equal(runDeployed([deployed], "production"), true);
  const superseded = job("deploy / production", "success", [
    { name: "Deploy and verify platform", conclusion: "skipped" },
    { name: "Deploy and verify schedule-builder", conclusion: "skipped" },
  ]);
  assert.equal(runDeployed([superseded], "production"), false);
});

test("lastDeployed skips this run's own SHA and failed deploys", async () => {
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const api = fakeApi({
    [`/repos/${REPO}/actions/workflows/ci.yaml/runs`]: {
      workflow_runs: [
        { id: 1, head_sha: SHA },
        { id: 2, head_sha: B },
        { id: 3, head_sha: C },
      ],
    },
    [`/repos/${REPO}/actions/runs/2/jobs`]: {
      jobs: [job("deploy / staging-deploy (platform)", "failure")],
    },
    [`/repos/${REPO}/actions/runs/3/jobs`]: {
      jobs: [job("deploy / staging-deploy (platform)", "success")],
    },
  });
  assert.equal(
    await lastDeployed({ api, repo: REPO, tier: "staging", before: SHA }),
    C,
  );
  assert.ok(!api.seen.some((p) => p.includes("/runs/1/")));
});

test("lastDeployed is empty when no recent run deployed", async () => {
  const api = fakeApi({
    [`/repos/${REPO}/actions/workflows/ci.yaml/runs`]: { workflow_runs: [] },
  });
  assert.equal(
    await lastDeployed({ api, repo: REPO, tier: "production", before: SHA }),
    "",
  );
});
