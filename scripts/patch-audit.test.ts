import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditPatch,
  checkConsistency,
  compareVersions,
  findFixRelease,
  installedVersion,
  parsePatchedDependencies,
  parseUpstreamUrl,
  resolveUpstream,
  type FetchLike,
  type ManifestEntry,
  type UpstreamStatus,
} from "./patch-audit.ts";

const yaml = `
catalog:
  react: ^19.2.8

patchedDependencies:
  # a comment
  '@vinext/cloudflare@1.0.1': patches/@vinext__cloudflare@1.0.1.patch
  react-dom@19.2.8: patches/react-dom@19.2.8.patch

other: true
`;

const entry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  file: "a@1.0.0.patch",
  why: "because",
  upstream: ["https://github.com/o/r/pull/1"],
  releasedIn: "pkg",
  ...overrides,
});

describe("parsePatchedDependencies", () => {
  it("reads quoted and bare keys and stops at the next top-level key", () => {
    assert.deepEqual(parsePatchedDependencies(yaml), {
      "@vinext/cloudflare@1.0.1": "patches/@vinext__cloudflare@1.0.1.patch",
      "react-dom@19.2.8": "patches/react-dom@19.2.8.patch",
    });
  });
});

describe("checkConsistency", () => {
  const patched = { "a@1.0.0": "patches/a@1.0.0.patch" };
  const patchFiles = new Set(["a@1.0.0.patch", "patches.json"]);

  it("passes a matching manifest", () => {
    assert.deepEqual(
      checkConsistency({
        patched,
        manifest: { "a@1.0.0": entry() },
        patchFiles,
      }),
      [],
    );
  });

  it("flags keys missing on either side", () => {
    const errors = checkConsistency({
      patched,
      manifest: { "b@2.0.0": entry({ file: "a@1.0.0.patch" }) },
      patchFiles,
    });
    assert.match(
      errors.join("\n"),
      /a@1\.0\.0: in patchedDependencies but missing/,
    );
    assert.match(
      errors.join("\n"),
      /b@2\.0\.0: in patches\/patches\.json but not in patchedDependencies/,
    );
  });

  it("flags a missing file and a path mismatch", () => {
    const missing = checkConsistency({
      patched,
      manifest: { "a@1.0.0": entry({ file: "gone.patch" }) },
      patchFiles,
    });
    assert.match(missing.join("\n"), /patches\/gone\.patch does not exist/);
    assert.match(missing.join("\n"), /does not match patchedDependencies path/);
  });

  it("flags empty why, upstream, releasedIn and bad URLs", () => {
    const errors = checkConsistency({
      patched,
      manifest: {
        "a@1.0.0": entry({ why: " ", upstream: [], releasedIn: "" }),
      },
      patchFiles,
    });
    for (const fragment of [
      '"why" is empty',
      '"releasedIn" is empty',
      '"upstream" must list',
    ]) {
      assert.ok(
        errors.some((error) => error.includes(fragment)),
        `expected an error containing ${fragment}`,
      );
    }
    const bad = checkConsistency({
      patched,
      manifest: { "a@1.0.0": entry({ upstream: ["https://example.com/x"] }) },
      patchFiles,
    });
    assert.match(bad.join("\n"), /not a GitHub PR or issue URL/);
  });
});

describe("resolveUpstream", () => {
  const s = (resolved: boolean, date: string | null): UpstreamStatus => ({
    url: "u",
    resolved,
    date,
    state: resolved ? "merged" : "open",
  });

  it("needs every URL by default and dates by the last one", () => {
    assert.deepEqual(
      resolveUpstream([s(true, "2026-01-01T00:00:00Z"), s(false, null)], false),
      { resolved: false, resolvedAt: null },
    );
    assert.deepEqual(
      resolveUpstream(
        [s(true, "2026-01-01T00:00:00Z"), s(true, "2026-02-01T00:00:00Z")],
        false,
      ),
      { resolved: true, resolvedAt: "2026-02-01T00:00:00Z" },
    );
  });

  it("needs one URL with anyOf and dates by the earliest", () => {
    assert.deepEqual(
      resolveUpstream(
        [s(true, "2026-03-01T00:00:00Z"), s(true, "2026-02-01T00:00:00Z")],
        true,
      ),
      { resolved: true, resolvedAt: "2026-02-01T00:00:00Z" },
    );
    assert.equal(
      resolveUpstream([s(false, null), s(false, null)], true).resolved,
      false,
    );
  });
});

describe("versions", () => {
  it("compares stable versions numerically", () => {
    assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
    assert.equal(compareVersions("1.0.1", "1.0.1"), 0);
  });

  it("picks the earliest stable release after resolution that is newer than installed", () => {
    const times = {
      "1.0.0": "2026-01-01T00:00:00Z",
      "1.0.1": "2026-02-01T00:00:00Z",
      "1.0.2": "2026-03-01T00:00:00Z",
      "1.1.0-beta.1": "2026-03-02T00:00:00Z",
      "1.1.0": "2026-04-01T00:00:00Z",
    };
    assert.equal(
      findFixRelease(times, "1.0.1", "2026-02-15T00:00:00Z"),
      "1.0.2",
    );
    // Published after resolution but not newer than what we run.
    assert.equal(findFixRelease(times, "1.1.0", "2026-02-15T00:00:00Z"), null);
    // Newer than installed but published before the fix landed.
    assert.equal(findFixRelease(times, "1.0.0", "2026-05-01T00:00:00Z"), null);
  });

  it("reads the highest installed version from the lockfile, patch hashes included", () => {
    const lock = [
      "packages:",
      "  vinext@1.0.0:",
      "  vinext@1.0.1:",
      "  '@vinext/cloudflare@1.0.1(patch_hash=abc)(vinext@1.0.1)':",
      "  vinext-other@9.9.9:",
    ].join("\n");
    assert.equal(installedVersion(lock, "vinext"), "1.0.1");
    assert.equal(installedVersion(lock, "@vinext/cloudflare"), "1.0.1");
    assert.equal(installedVersion(lock, "missing"), null);
  });
});

describe("parseUpstreamUrl", () => {
  it("tells PRs from issues", () => {
    const pr = parseUpstreamUrl(
      "https://github.com/cloudflare/vinext/pull/3242",
    );
    assert.equal(pr?.kind, "pr");
    assert.equal(pr?.number, 3242);
    assert.equal(
      parseUpstreamUrl("https://github.com/cloudflare/workerd/issues/6408")
        ?.kind,
      "issue",
    );
    assert.equal(
      parseUpstreamUrl("https://github.com/cloudflare/workerd"),
      null,
    );
  });
});

describe("auditPatch", () => {
  const lockfile = "packages:\n  pkg@1.0.0:\n";
  const reply = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });

  function mockFetch(routes: Record<string, unknown | Error>): {
    fetch: FetchLike;
    calls: string[];
  } {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([fragment]) =>
        url.includes(fragment),
      );
      if (!hit) return reply({}, 404);
      if (hit[1] instanceof Error) throw hit[1];
      return reply(hit[1]);
    };
    return { fetch, calls };
  }

  it("is pending while the upstream PR is open, without touching npm", async () => {
    const { fetch, calls } = mockFetch({
      "/pulls/1": { state: "open", merged_at: null },
    });
    const report = await auditPatch("k", entry(), { fetch, lockfile });
    assert.equal(report.state, "pending");
    assert.equal(
      calls.some((c) => c.includes("npmjs")),
      false,
    );
  });

  it("is awaiting-release when merged but nothing newer is published", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: { created: "x", modified: "y", "1.0.0": "2026-01-01T00:00:00Z" },
      },
    });
    assert.equal(
      (await auditPatch("k", entry(), { fetch, lockfile })).state,
      "awaiting-release",
    );
  });

  it("is removable, with an action, once a newer release follows the merge", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: {
          "1.0.0": "2026-01-01T00:00:00Z",
          "1.0.1": "2026-06-02T00:00:00Z",
        },
      },
    });
    const report = await auditPatch("k", entry(), { fetch, lockfile });
    assert.equal(report.state, "removable");
    assert.equal(report.fixVersion, "1.0.1");
    assert.ok(report.action?.includes("bump pkg to 1.0.1"));
  });

  it("honours anyOf across a PR and an issue", async () => {
    const routes = {
      "/pulls/1": { state: "open", merged_at: null },
      "/issues/2": { state: "closed", closed_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: {
          "1.0.0": "2026-01-01T00:00:00Z",
          "1.0.1": "2026-06-02T00:00:00Z",
        },
      },
    };
    const upstream = [
      "https://github.com/o/r/pull/1",
      "https://github.com/o/r/issues/2",
    ];
    const all = await auditPatch("k", entry({ upstream }), {
      fetch: mockFetch(routes).fetch,
      lockfile,
    });
    assert.equal(all.state, "pending");
    const any = await auditPatch("k", entry({ upstream, anyOf: true }), {
      fetch: mockFetch(routes).fetch,
      lockfile,
    });
    assert.equal(any.state, "removable");
  });

  it("treats a closed-unmerged PR as unresolved", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: null },
    });
    assert.equal(
      (await auditPatch("k", entry(), { fetch, lockfile })).state,
      "pending",
    );
  });

  it("turns network and API errors into warnings, never throws", async () => {
    const down = mockFetch({ "/pulls/1": new Error("offline") });
    const report = await auditPatch("k", entry(), {
      fetch: down.fetch,
      lockfile,
    });
    assert.equal(report.state, "unknown");
    assert.match(report.warnings.join(), /offline/);

    const npmDown = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
    });
    const second = await auditPatch("k", entry(), {
      fetch: npmDown.fetch,
      lockfile,
    });
    assert.equal(second.state, "unknown");
    assert.match(second.warnings.join(), /npm/);
  });

  it("sends the token as a bearer header when given", async () => {
    let seen: string | undefined;
    const fetch: FetchLike = async (_url, init) => {
      seen = init?.headers?.Authorization;
      return reply({ state: "open", merged_at: null });
    };
    await auditPatch("k", entry(), { fetch, lockfile, token: "t0ken" });
    assert.equal(seen, "Bearer t0ken");
  });
});
