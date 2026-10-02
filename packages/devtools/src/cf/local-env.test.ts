import { existsSync, readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { EnvEntry } from "@devdogsuga/env";
import { scopedProcessEnv, withWranglerEnv } from "./local-env.js";

/** The fields `withWranglerEnv` reads are `key`, `source`, and `meta`; the rest
 * exist only to satisfy `EnvEntry`'s shape. */
function entry(
  key: string,
  source: string,
  meta?: Partial<EnvEntry["meta"]>,
): EnvEntry {
  return {
    key,
    source,
    schema: z.string(),
    meta: {
      doc: "test fixture",
      scope: "environment",
      secrecy: "public",
      ...meta,
    },
    client: false,
  };
}

describe("withWranglerEnv", () => {
  it("includes only entries whose source is the requested app, deduped and sorted", async () => {
    const entries = [
      entry("ZEBRA", "sandbox"),
      entry("ALPHA", "sandbox"),
      entry("ALPHA", "sandbox"), // duplicate declaration, e.g. re-imported manifest
      entry("OTHER_APP_KEY", "platform"),
    ];
    const env = { ZEBRA: "z-value", ALPHA: "a-value", OTHER_APP_KEY: "nope" };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe("ALPHA='a-value'\nZEBRA='z-value'\n");
  });

  it("excludes the wrangler-owned keys (DEPLOY_ENV/NODE_ENV) BY NAME so a stray .env value can't override the wrangler tier var", async () => {
    const entries = [
      entry("DEPLOY_ENV", "sandbox", { scope: "default", commented: true }),
      entry("NODE_ENV", "sandbox", { scope: "default", commented: true }),
      // A default-scope key that is NOT commented is genuinely env-sourced and
      // must still be materialized.
      entry("GITHUB_ORG", "sandbox", { scope: "default" }),
      entry("API_URL", "sandbox"),
    ];
    const env = {
      DEPLOY_ENV: "",
      NODE_ENV: "production",
      GITHUB_ORG: "devdogsuga",
      API_URL: "https://api.example",
    };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe(
      "API_URL='https://api.example'\nGITHUB_ORG='devdogsuga'\n",
    );
  });

  it("keeps a default+commented key that is NOT wrangler-owned (the GITHUB_COMPETITION_REPO shape) — exclusion is by name, never by registry-meta heuristic", async () => {
    // GITHUB_COMPETITION_REPO shares DEPLOY_ENV's registry shape
    // (scope: "default", commented: true) but is a contributor's deliberate
    // .env override with no wrangler.jsonc var behind it; a meta-based filter
    // silently stripped it from `wrangler dev`. See scopedKeys's header.
    const entries = [
      entry("GITHUB_COMPETITION_REPO", "sandbox", {
        scope: "default",
        commented: true,
      }),
      entry("DEPLOY_ENV", "sandbox", { scope: "default", commented: true }),
    ];
    const env = {
      GITHUB_COMPETITION_REPO: "MyFork",
      DEPLOY_ENV: "development",
    };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe("GITHUB_COMPETITION_REPO='MyFork'\n");
  });

  it("skips keys with no value in the injected environment", async () => {
    const entries = [entry("PRESENT", "sandbox"), entry("ABSENT", "sandbox")];
    const env = { PRESENT: "here" };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe("PRESENT='here'\n");
  });

  it("writes the file at mode 0600 and the callback's return value passes through", async () => {
    const entries = [entry("KEY", "sandbox")];
    const env = { KEY: "value" };

    const result = await withWranglerEnv(
      "sandbox",
      async (path) => {
        const mode = statSync(path).mode & 0o777;
        expect(mode).toBe(0o600);
        return 42;
      },
      { env, entries },
    );

    expect(result).toBe(42);
  });

  it("removes the directory after the callback resolves", async () => {
    let capturedPath = "";
    await withWranglerEnv(
      "sandbox",
      async (path) => {
        capturedPath = path;
        expect(existsSync(path)).toBe(true);
      },
      { env: {}, entries: [] },
    );

    expect(existsSync(capturedPath)).toBe(false);
  });

  it("removes the directory even when the callback throws", async () => {
    let capturedPath = "";
    await expect(
      withWranglerEnv(
        "sandbox",
        async (path) => {
          capturedPath = path;
          throw new Error("boom");
        },
        { env: {}, entries: [] },
      ),
    ).rejects.toThrow("boom");

    expect(existsSync(capturedPath)).toBe(false);
  });

  it("registers a SIGINT and a SIGTERM listener while `fn` runs, and removes both before returning", async () => {
    const before = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    };

    await withWranglerEnv(
      "sandbox",
      async () => {
        expect(process.listenerCount("SIGINT")).toBe(before.SIGINT + 1);
        expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM + 1);
      },
      { env: {}, entries: [] },
    );

    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
  });

  it("removes its SIGINT/SIGTERM listeners even when the callback throws", async () => {
    const before = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    };

    await expect(
      withWranglerEnv(
        "sandbox",
        async () => {
          throw new Error("boom");
        },
        { env: {}, entries: [] },
      ),
    ).rejects.toThrow("boom");

    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
  });

  it("a SIGINT delivered mid-callback removes the temp directory (simulated in-process, without sending a real signal)", async () => {
    // Sending an actual SIGINT would kill the test runner itself; instead,
    // grab the listener `withWranglerEnv` installed and invoke it directly —
    // exercising the same cleanup path a real signal would reach, minus the
    // re-raise (which would terminate this process).
    let capturedPath = "";
    const originalKill = process.kill.bind(process);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((pid, signal) => {
        if (signal === "SIGINT") return true; // swallow the re-raise
        return originalKill(pid, signal);
      });

    try {
      await withWranglerEnv(
        "sandbox",
        async (path) => {
          capturedPath = path;
          const listeners = process.listeners(
            "SIGINT",
          ) as NodeJS.SignalsListener[];
          const installed = listeners.at(-1);
          if (!installed) throw new Error("no SIGINT listener installed");
          installed("SIGINT");
          expect(existsSync(capturedPath)).toBe(false);
        },
        { env: {}, entries: [] },
      );
    } finally {
      killSpy.mockRestore();
    }

    // The `finally`'s own cleanup() call, reached after the simulated
    // signal, is a no-op thanks to the idempotency guard — no error, and the
    // directory stays gone.
    expect(existsSync(capturedPath)).toBe(false);
  });
});

describe("scopedProcessEnv", () => {
  const entries = [
    entry("DB_URL", "schedule-builder"),
    entry("DB_URL", "platform"), // shared: this app declares it too
    entry("GITHUB_APP_PRIVATE_KEY", "platform"),
    entry("DEPLOY_ENV", "schedule-builder", { scope: "default" }),
  ];

  it("drops keys only other apps declare and keeps shared and undeclared ones", async () => {
    const env = await scopedProcessEnv(
      "schedule-builder",
      {
        DB_URL: "postgres://local",
        GITHUB_APP_PRIVATE_KEY: "secret",
        PATH: "/usr/bin",
      },
      "development",
      entries,
    );
    expect(env.DB_URL).toBe("postgres://local");
    expect(env.PATH).toBe("/usr/bin");
    expect(env).not.toHaveProperty("GITHUB_APP_PRIVATE_KEY");
  });

  it("leaves NODE_ENV to Vite, pins DEPLOY_ENV, and exposes the env to the Worker", async () => {
    const env = await scopedProcessEnv(
      "schedule-builder",
      { NODE_ENV: "production", DEPLOY_ENV: "" },
      "development",
      entries,
    );
    expect(env).not.toHaveProperty("NODE_ENV");
    expect(env.DEPLOY_ENV).toBe("development");
    expect(env.CLOUDFLARE_INCLUDE_PROCESS_ENV).toBe("true");
  });
});
