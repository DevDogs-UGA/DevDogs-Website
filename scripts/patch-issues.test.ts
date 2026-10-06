import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PatchReport } from "./patch-audit.ts";
import {
  applyPlan,
  issueBody,
  issueTitle,
  listOpenIssues,
  planIssues,
  type Api,
} from "./patch-issues.ts";

const report = (overrides: Partial<PatchReport> = {}): PatchReport => ({
  key: "react@19.2.8",
  file: "react@19.2.8.patch",
  state: "removable",
  anyOf: true,
  upstream: [
    {
      url: "https://github.com/cloudflare/vinext/pull/3233",
      resolved: true,
      date: "2026-10-01T00:00:00Z",
      state: "merged",
    },
  ],
  resolvedAt: "2026-10-01T00:00:00Z",
  releasedIn: "vinext",
  installed: "1.0.1",
  fixVersion: "1.0.2",
  action: "bump vinext to 1.0.2",
  warnings: [],
  ...overrides,
});

describe("planIssues", () => {
  it("creates one issue per removable patch and ignores the rest", () => {
    const plan = planIssues(
      [
        report(),
        report({ key: "react-dom@19.2.8", state: "pending" }),
        report({ key: "other@1.0.0", state: "awaiting-release" }),
      ],
      [],
    );
    assert.deepEqual(plan, [
      {
        kind: "create",
        title: "Remove patch react@19.2.8",
        body: issueBody(report()),
      },
    ]);
  });

  it("keeps an open issue whose body is current and updates a stale one", () => {
    const current = issueBody(report());
    assert.deepEqual(
      planIssues(
        [report()],
        [{ number: 7, title: issueTitle("react@19.2.8"), body: current }],
      ),
      [{ kind: "keep", number: 7, title: "Remove patch react@19.2.8" }],
    );
    assert.deepEqual(
      planIssues(
        [report()],
        [{ number: 7, title: issueTitle("react@19.2.8"), body: "old" }],
      ),
      [
        {
          kind: "update",
          number: 7,
          title: "Remove patch react@19.2.8",
          body: current,
        },
      ],
    );
  });

  it("dedupes by title onto the oldest issue", () => {
    const plan = planIssues(
      [report()],
      [
        { number: 9, title: issueTitle("react@19.2.8"), body: "x" },
        { number: 3, title: issueTitle("react@19.2.8"), body: "x" },
        { number: 1, title: "Something else", body: null },
      ],
    );
    assert.equal(plan.length, 1);
    assert.equal(plan[0]?.kind, "update");
    assert.equal(plan[0] && "number" in plan[0] && plan[0].number, 3);
  });

  it("names the action, the upstream links and the fix in the body", () => {
    const body = issueBody(report());
    assert.match(body, /bump vinext to 1\.0\.2/);
    assert.match(body, /vinext\/pull\/3233/);
    assert.match(body, /vinext@1\.0\.2/);
  });
});

describe("REST calls", () => {
  function fakeApi(pages: unknown[][]) {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "GET") {
        const page = Number(new URL(url).searchParams.get("page"));
        return Response.json(pages[page - 1] ?? []);
      }
      return Response.json({ number: 42 });
    }) as typeof fetch;
    const api: Api = {
      fetch: fetchImpl,
      repo: "DevDogsUGA/Backstage",
      token: "t",
    };
    return { api, calls };
  }

  it("lists open issues across pages and drops pull requests", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `t${i + 1}`,
      body: null,
    }));
    const { api } = fakeApi([
      full,
      [
        { number: 101, title: "pr", body: null, pull_request: {} },
        { number: 102, title: "issue", body: "b" },
      ],
    ]);
    const issues = await listOpenIssues(api);
    assert.equal(issues.length, 101);
    assert.equal(issues.at(-1)?.number, 102);
  });

  it("creates and updates through the REST API and leaves kept issues alone", async () => {
    const { api, calls } = fakeApi([]);
    const log = await applyPlan(api, [
      { kind: "create", title: "Remove patch a@1.0.0", body: "b" },
      { kind: "update", number: 5, title: "Remove patch b@1.0.0", body: "c" },
      { kind: "keep", number: 6, title: "Remove patch c@1.0.0" },
    ]);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      [
        "POST https://api.github.com/repos/DevDogsUGA/Backstage/issues",
        "PATCH https://api.github.com/repos/DevDogsUGA/Backstage/issues/5",
      ],
    );
    assert.deepEqual(log, [
      "created #42: Remove patch a@1.0.0",
      "updated #5: Remove patch b@1.0.0",
      "unchanged #6: Remove patch c@1.0.0",
    ]);
  });

  it("fails loudly when the API refuses", async () => {
    const api: Api = {
      fetch: (async () => new Response("no", { status: 403 })) as typeof fetch,
      repo: "o/r",
      token: "t",
    };
    await assert.rejects(listOpenIssues(api), /API 403/);
  });
});
