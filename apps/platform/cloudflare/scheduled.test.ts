// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, scheduled } from "./scheduled";

/**
 * Every cron path must correspond to a route that exists.
 *
 * The dispatcher was silently wrong. Every entry was written as
 * `/api/cron/...`, but the handlers live under `src/app/(api)/`, and
 * parentheses make a route group: the segment does not appear in the URL. So
 * `/api/cron/github-reconcile` returned 404 while `/cron/github-reconcile`
 * served 200, and had done since the Vercel-to-Cloudflare move that carried
 * the paths over from `vercel.json` unchanged.
 *
 * The dispatcher swallows non-2xx responses, so the crons failed quietly: no
 * config reconcile, no GitHub reconcile. Typechecking cannot see it, because
 * a path is just a string. Mapping the string back to a file is the only
 * check that would have.
 */

const APP = join(import.meta.dirname, "..", "src", "app");

/**
 * A URL path to the route file that serves it.
 *
 * Route groups are directories wrapped in parentheses and contribute nothing to
 * the URL, so a path can be served from any of them. Trying each group rather
 * than hardcoding `(api)` keeps the test correct if a route moves, and is
 * exactly the mapping the dispatcher gets wrong by hand.
 */
function routeExists(urlPath: string): boolean {
  const GROUPS = ["(api)", "(site)", ""];
  return GROUPS.some((group) =>
    existsSync(join(APP, group, urlPath, "route.ts")),
  );
}

describe("cron dispatcher", () => {
  const entries = Object.entries(CRON_ROUTES).flatMap(([cron, entry]) =>
    entry.routes.map((path) => ({ cron, path })),
  );

  it("dispatches at least one route", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("$path exists (fired by $cron)", ({ path }) => {
    expect(routeExists(path)).toBe(true);
  });

  it("never prefixes a path with the route group", () => {
    // The specific mistake, named. `(api)` is a group; `/api` is a URL segment,
    // and there is no directory that produces one.
    for (const { path } of entries) {
      expect(path.startsWith("/api/")).toBe(false);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("continues dispatching sibling routes, then reports failures", async () => {
    const paths = CRON_ROUTES["0 0 * * *"]?.routes ?? [];
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      Promise.resolve(
        new Response(null, {
          status: readRequestUrl(input).endsWith("/cron/github-reconcile")
            ? 503
            : 200,
        }),
      ),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scheduled(
        { cron: "0 0 * * *" },
        {
          BASE_URL: "https://example.test",
          CRON_SECRET: "secret",
        },
      ),
    ).rejects.toThrow("/cron/github-reconcile: HTTP 503");

    expect(fetchMock).toHaveBeenCalledTimes(paths.length);
    expect(
      fetchMock.mock.calls.map(([input]) => readRequestUrl(input)),
    ).toEqual(paths.map((path) => `https://example.test${path}`));
    expect(errorSpy).toHaveBeenCalledWith(
      "cron_dispatch_failed",
      expect.objectContaining({ cron: "0 0 * * *" }),
    );
  });

  it("records the group's heartbeat once every route succeeded", async () => {
    const paths = CRON_ROUTES["0 0 * * *"]?.routes ?? [];
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await scheduled(
      { cron: "0 0 * * *" },
      { BASE_URL: "https://example.test", CRON_SECRET: "secret" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(paths.length + 1);
    const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(readRequestUrl(input ?? "")).toBe(
      "https://example.test/cron/heartbeats",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(String(init?.body))).toEqual({
      job: "platform-nightly-repair",
    });
  });

  it("checks the daily jobs' heartbeats from the monitored group", () => {
    const monitored = Object.values(CRON_ROUTES).filter(
      (entry) => entry.monitorSlug,
    );
    expect(monitored).toHaveLength(1);
    expect(monitored[0]?.routes).toContain("/cron/heartbeats");
  });
});

function readRequestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
