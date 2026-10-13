import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureHostedAuthSettings,
  ManagementError,
  mergeAllowList,
  projectRefOf,
} from "./management.js";
import { CLI, recordingRunner } from "./fixtures.js";
import { resolveSupabaseCli } from "./supabase-cli.js";

describe("projectRefOf", () => {
  it("reads a ref host and nothing else", () => {
    expect(projectRefOf("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "abcdefghijklmnopqrst",
    );
    expect(projectRefOf("https://dogpack.supabase.co")).toBeNull();
    expect(projectRefOf("http://127.0.0.1:54321")).toBeNull();
  });
});

describe("mergeAllowList", () => {
  it("adds what is missing and keeps what was there, in order", () => {
    expect(mergeAllowList("a://x, b://y", ["b://y", "c://z"])).toBe(
      "a://x,b://y,c://z",
    );
    expect(mergeAllowList(null, ["c://z"])).toBe("c://z");
    expect(mergeAllowList("", [])).toBe("");
  });
});

describe("ensureHostedAuthSettings", () => {
  const REF = "abcdefghijklmnopqrst";

  function api(current: Record<string, unknown>, patchStatus = 200) {
    const calls: { method: string; body?: unknown; auth: string | null }[] = [];
    const impl: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        method: init?.method ?? "GET",
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as unknown)
            : undefined,
        auth: headers.get("authorization"),
      });
      expect(input).toBe(
        `https://api.supabase.com/v1/projects/${REF}/config/auth`,
      );
      return Promise.resolve(
        init?.method === "PATCH"
          ? new Response("{}", { status: patchStatus })
          : Response.json(current),
      );
    };
    return { impl, calls };
  }

  it("turns on custom OAuth and merges the redirect URIs in one PATCH", async () => {
    const { impl, calls } = api({
      custom_oauth_enabled: false,
      uri_allow_list: "http://localhost:3000",
    });
    const result = await ensureHostedAuthSettings({
      projectRef: REF,
      token: "sbp_x",
      redirectUris: ["dev.dogpack://login-callback"],
      fetch: impl,
    });
    expect(result.changed).toEqual(["custom_oauth_enabled", "uri_allow_list"]);
    expect(calls[1]).toEqual({
      method: "PATCH",
      auth: "Bearer sbp_x",
      body: {
        custom_oauth_enabled: true,
        uri_allow_list: "http://localhost:3000,dev.dogpack://login-callback",
      },
    });
  });

  it("sends nothing when the settings are already right", async () => {
    const { impl, calls } = api({
      custom_oauth_enabled: true,
      uri_allow_list: "dev.dogpack://login-callback",
    });
    const result = await ensureHostedAuthSettings({
      projectRef: REF,
      token: "t",
      redirectUris: ["dev.dogpack://login-callback"],
      fetch: impl,
    });
    expect(result.changed).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("explains a refused token", async () => {
    const impl: typeof fetch = () =>
      Promise.resolve(new Response("", { status: 401 }));
    await expect(
      ensureHostedAuthSettings({
        projectRef: REF,
        token: "bad",
        redirectUris: [],
        fetch: impl,
      }),
    ).rejects.toThrow(/access token was refused/);
  });

  it("reports a failed update", async () => {
    const { impl } = api({ custom_oauth_enabled: false }, 500);
    await expect(
      ensureHostedAuthSettings({
        projectRef: REF,
        token: "t",
        redirectUris: [],
        fetch: impl,
      }),
    ).rejects.toBeInstanceOf(ManagementError);
  });
});

describe("resolveSupabaseCli", () => {
  it("takes the repo's own binary when its version is the pin", async () => {
    const { run, calls } = recordingRunner(() => ({ stdout: "2.117.0\n" }));
    const cli = await resolveSupabaseCli("/repo", "2.117.0", run, () => true);
    expect(cli).toEqual({
      command: join("/repo", "node_modules", ".bin", "supabase"),
      prefix: [],
      source: "repo",
    });
    expect(calls).toHaveLength(1);
  });

  it("skips a binary at the wrong version and falls back to npx at the pin", async () => {
    const { run } = recordingRunner(() => ({ stdout: "2.120.0\n" }));
    const cli = await resolveSupabaseCli("/repo", "2.117.0", run, () => true);
    expect(cli).toEqual({
      command: "npx",
      prefix: ["--yes", "supabase@2.117.0"],
      source: "npx",
    });
  });

  it("uses a global supabase at the pin when the repo has none", async () => {
    const { run } = recordingRunner(() => ({ stdout: "2.117.0" }));
    const cli = await resolveSupabaseCli("/repo", "2.117.0", run, () => false);
    expect(cli.source).toBe("path");
  });

  it("falls back to npx when nothing is installed", async () => {
    const run = () => Promise.reject(new Error("ENOENT"));
    const cli = await resolveSupabaseCli("/repo", "2.117.0", run, () => false);
    expect(cli.source).toBe("npx");
    expect(CLI.source).toBe("path");
  });
});
