import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./checks.js";
import { DeployError } from "./report.js";
import { runReconcile, runSmoke } from "./smoke.js";
import type { AppSmokeConfig } from "./smoke-config.js";

const config: AppSmokeConfig = {
  hosts: { staging: "staging.example.org", production: "example.org" },
  publicPaths: ["/", "/about"],
  protectedPath: "/admin",
  protectedRedirectPrefix: "/login",
};

function respond(
  handler: (url: string) => {
    status: number;
    location?: string;
    body?: unknown;
  },
): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetchImpl: async (url) => {
      urls.push(url);
      const { status, location, body } = handler(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get: (name) => (name === "location" ? (location ?? null) : null),
        },
        json: async () => body,
      };
    },
  };
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("runSmoke", () => {
  it("checks every public path and the protected redirect on the tier's host", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { fetchImpl, urls } = respond((url) =>
      url.endsWith("/admin")
        ? { status: 302, location: "/login?next=/admin" }
        : { status: 200 },
    );

    const results = await runSmoke({
      app: "platform",
      tier: "staging",
      config,
      fetchImpl,
      env: {},
    });

    expect(urls).toEqual([
      "https://staging.example.org/",
      "https://staging.example.org/about",
      "https://staging.example.org/admin",
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "skip",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("fails the run when a route does not answer 200", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { fetchImpl } = respond((url) =>
      url.endsWith("/about")
        ? { status: 500 }
        : url.endsWith("/admin")
          ? { status: 302, location: "/login" }
          : { status: 200 },
    );

    await runSmoke({
      app: "platform",
      tier: "production",
      config,
      fetchImpl,
      env: {},
    });

    expect(process.exitCode).toBe(1);
  });

  it("reads this deploy's Sentry release when Sentry is configured", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { fetchImpl } = respond((url) =>
      url.endsWith("/admin")
        ? { status: 302, location: "/login" }
        : { status: 200 },
    );
    const checkRelease = vi.fn(async () => ({
      name: "Sentry release",
      status: "pass" as const,
      detail: "release visible",
    }));

    await runSmoke({
      app: "platform",
      tier: "production",
      config,
      fetchImpl,
      checkRelease,
      env: {
        SENTRY_AUTH_TOKEN: "t",
        SENTRY_ORG: "o",
        SENTRY_PROJECT: "p",
        GITHUB_SHA: "abc123",
      },
    });

    expect(checkRelease).toHaveBeenCalledWith(
      { org: "o", project: "p", authToken: "t" },
      "abc123",
    );
  });

  it("names the field to add when the app has no smoke data", async () => {
    await expect(
      runSmoke({ app: "sandbox", tier: "staging", env: {} }),
    ).rejects.toThrow(DeployError);
  });
});

describe("runReconcile", () => {
  it("refuses without CRON_SECRET before sending anything", async () => {
    const { fetchImpl, urls } = respond(() => ({ status: 200 }));

    await expect(
      runReconcile({ tier: "staging", config, fetchImpl, env: {} }),
    ).rejects.toThrow(/CRON_SECRET/);
    expect(urls).toEqual([]);
  });

  it("calls the platform's reconcile route and passes on success", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { fetchImpl, urls } = respond(() => ({
      status: 200,
      body: { success: true },
    }));

    const result = await runReconcile({
      tier: "production",
      config,
      fetchImpl,
      env: { CRON_SECRET: "s" },
    });

    expect(urls).toEqual(["https://example.org/cron/config-reconcile"]);
    expect(result.status).toBe("pass");
    expect(process.exitCode).toBeUndefined();
  });

  it("fails when the route answers 200 but the reconcile did not succeed", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { fetchImpl } = respond(() => ({
      status: 200,
      body: { success: false, reason: "no config" },
    }));

    await runReconcile({
      tier: "staging",
      config,
      fetchImpl,
      env: { CRON_SECRET: "s" },
    });

    expect(process.exitCode).toBe(1);
  });
});
