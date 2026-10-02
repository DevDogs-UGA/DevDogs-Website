import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  declaredMonitorSlugs,
  nextPage,
  runPruneMonitors,
  type SentryFetch,
} from "./monitors.js";

interface Call {
  url: string;
  method: string;
}

/** Serves `pages` of monitor slugs in order, linked by cursor, and records every call. */
function stubSentry(
  pages: string[][],
  deleteStatus = 202,
): { fetchImpl: SentryFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: SentryFetch = async (url, init) => {
    const method = init.method ?? "GET";
    calls.push({ url, method });
    if (method === "DELETE") {
      return {
        ok: deleteStatus < 300,
        status: deleteStatus,
        headers: { get: () => null },
        json: async () => null,
      };
    }
    const page = Number(/cursor=(\d+)/.exec(url)?.[1] ?? 0);
    const more = page + 1 < pages.length;
    const link =
      `<${url}&cursor=${page - 1}>; rel="previous"; results="false", ` +
      `<https://sentry.io/next?cursor=${page + 1}>; rel="next"; results="${more}"`;
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "link" ? link : null) },
      json: async () => (pages[page] ?? []).map((slug) => ({ slug })),
    };
  };
  return { fetchImpl, calls };
}

const ENV = { SENTRY_MONITORS_TOKEN: "t", SENTRY_ORG: "devdogsuga" };

describe("nextPage", () => {
  it("follows rel=next only while it has results", () => {
    expect(
      nextPage(
        '<https://a/?cursor=0>; rel="previous"; results="false", <https://a/?cursor=1>; rel="next"; results="true"',
      ),
    ).toBe("https://a/?cursor=1");
    expect(
      nextPage('<https://a/?cursor=1>; rel="next"; results="false"'),
    ).toBeUndefined();
    expect(nextPage(null)).toBeUndefined();
  });
});

describe("runPruneMonitors", () => {
  it("deletes undeclared monitors with the app's prefix, across pages", async () => {
    const { fetchImpl, calls } = stubSentry([
      ["platform-cron-nightly-repair", "platform-cron-discord-role-sync"],
      ["platform-cron-config-reconcile", "hand-made-monitor"],
    ]);
    const deleted = await runPruneMonitors({
      app: "platform",
      tier: "production",
      env: ENV,
      declared: new Set([
        "platform-cron-nightly-repair",
        "platform-cron-config-reconcile",
      ]),
      fetchImpl,
    });
    expect(deleted).toEqual(["platform-cron-discord-role-sync"]);
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([
      {
        method: "DELETE",
        url: "https://sentry.io/api/0/projects/devdogsuga/platform/monitors/platform-cron-discord-role-sync/",
      },
    ]);
    expect(calls[0]!.url).toBe(
      "https://sentry.io/api/0/organizations/devdogsuga/monitors/?project=platform",
    );
  });

  it("deletes nothing on a dry run", async () => {
    const { fetchImpl, calls } = stubSentry([["platform-cron-old"]]);
    const deleted = await runPruneMonitors({
      app: "platform",
      tier: "production",
      dryRun: true,
      env: ENV,
      declared: new Set(),
      fetchImpl,
    });
    expect(deleted).toEqual(["platform-cron-old"]);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("never runs against staging", async () => {
    const { fetchImpl, calls } = stubSentry([["platform-cron-old"]]);
    await runPruneMonitors({
      app: "platform",
      tier: "staging",
      env: ENV,
      declared: new Set(),
      fetchImpl,
    });
    expect(calls).toEqual([]);
  });

  it("skips without SENTRY_MONITORS_TOKEN", async () => {
    const { fetchImpl, calls } = stubSentry([["platform-cron-old"]]);
    await runPruneMonitors({
      app: "platform",
      tier: "production",
      env: { SENTRY_ORG: "devdogsuga" },
      declared: new Set(),
      fetchImpl,
    });
    expect(calls).toEqual([]);
  });

  it("treats a 404 on delete as already gone", async () => {
    const { fetchImpl } = stubSentry([["platform-cron-old"]], 404);
    await expect(
      runPruneMonitors({
        app: "platform",
        tier: "production",
        env: ENV,
        declared: new Set(),
        fetchImpl,
      }),
    ).resolves.toEqual(["platform-cron-old"]);
  });

  it("fails on any other delete error", async () => {
    const { fetchImpl } = stubSentry([["platform-cron-old"]], 403);
    await expect(
      runPruneMonitors({
        app: "platform",
        tier: "production",
        env: ENV,
        declared: new Set(),
        fetchImpl,
      }),
    ).rejects.toThrow("HTTP 403");
  });
});

describe("declaredMonitorSlugs", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function checkout(app: string, source: string): string {
    root = mkdtempSync(join(tmpdir(), "prune-monitors-"));
    const dir = join(root, "apps", app, "cloudflare");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "scheduled.ts"), source);
    return root;
  }

  it("reads monitorSlug from CRON_ROUTES and WORKFLOW_CRONS", async () => {
    const dir = checkout(
      "demo",
      `export const CRON_ROUTES = {
         "0 0 * * *": { routes: ["/a"], label: "a", monitorSlug: "demo-a" },
         "*/5 * * * *": { routes: ["/b"], label: "b" },
       };
       export const WORKFLOW_CRONS = {
         "5 14 * * *": { binding: "W", label: "w", monitorSlug: "demo-w" },
       };`,
    );
    expect(await declaredMonitorSlugs("demo", dir)).toEqual(
      new Set(["demo-a", "demo-w"]),
    );
  });

  it("is undefined for an app with no scheduled.ts", async () => {
    root = mkdtempSync(join(tmpdir(), "prune-monitors-"));
    expect(await declaredMonitorSlugs("sandbox", root)).toBeUndefined();
  });
});
