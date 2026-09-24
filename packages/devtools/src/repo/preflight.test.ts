import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheFilePath,
  decidePreflight,
  fetchManifest,
  isDevMode,
  runPreflight,
} from "./preflight.js";

let dir: string;
const savedXdg = process.env.XDG_CACHE_HOME;
const savedGuard = process.env.DEVTOOLS_REEXEC_GUARD;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "devtools-preflight-test-"));
  process.env.XDG_CACHE_HOME = dir;
  delete process.env.DEVTOOLS_REEXEC_GUARD;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
  if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedXdg;
  if (savedGuard === undefined) delete process.env.DEVTOOLS_REEXEC_GUARD;
  else process.env.DEVTOOLS_REEXEC_GUARD = savedGuard;
});

describe("cacheFilePath", () => {
  it("honors XDG_CACHE_HOME", () => {
    expect(cacheFilePath()).toBe(join(dir, "devdogsuga-devtools", "minimums.json"));
  });
});

describe("fetchManifest", () => {
  it("fails open on a dead URL", async () => {
    const result = await fetchManifest({
      url: "http://127.0.0.1:1/definitely-not-listening.json",
      timeoutMs: 200,
    });
    expect(result.source).toBe("fail-open");
    expect(result.manifest).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("fails open on a schema mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ devtools: { latest: "1.0.0" } }), // missing `minimum`
      }),
    );
    const result = await fetchManifest({ url: "http://example.invalid/manifest.json" });
    expect(result.source).toBe("fail-open");
    expect(result.manifest).toBeNull();
  });

  it("caches a successful fetch on disk and reuses it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ devtools: { latest: "1.2.0", minimum: "1.0.0" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchManifest({ url: "http://example.invalid/manifest.json" });
    expect(first.source).toBe("network");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await fetchManifest({ url: "http://example.invalid/manifest.json" });
    expect(second.source).toBe("cache");
    expect(second.manifest).toEqual(first.manifest);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("--refresh (skipCache) bypasses a fresh cache entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devtools: { latest: "1.0.0", minimum: "1.0.0" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devtools: { latest: "2.0.0", minimum: "2.0.0" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await fetchManifest({ url: "http://example.invalid/manifest.json" });
    const refreshed = await fetchManifest({
      url: "http://example.invalid/manifest.json",
      skipCache: true,
    });
    expect(refreshed.source).toBe("network");
    expect(refreshed.manifest?.devtools.latest).toBe("2.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("decidePreflight", () => {
  function manifest(latest: string, minimum: string) {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ devtools: { latest, minimum } }),
    });
  }

  it("skip-preflight short-circuits before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: true,
      refresh: false,
    });
    expect(decision).toEqual({ action: "skip-preflight" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dev-mode short-circuits before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      devMode: true,
    });
    expect(decision).toEqual({ action: "dev-mode" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("up-to-date when current equals latest", async () => {
    vi.stubGlobal("fetch", manifest("0.1.0", "0.1.0"));
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
    });
    expect(decision.action).toBe("up-to-date");
  });

  it("nudges when behind latest but at or above minimum", async () => {
    vi.stubGlobal("fetch", manifest("0.2.0", "0.1.0"));
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
    });
    expect(decision).toMatchObject({ action: "nudge", from: "0.1.0", to: "0.2.0" });
  });

  it("self-refreshes when below minimum", async () => {
    vi.stubGlobal("fetch", manifest("0.2.0", "0.2.0"));
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
    });
    expect(decision).toMatchObject({ action: "self-refresh", from: "0.1.0", to: "0.2.0" });
  });

  it("trips the loop guard instead of self-refreshing a second time", async () => {
    process.env.DEVTOOLS_REEXEC_GUARD = "1";
    vi.stubGlobal("fetch", manifest("0.2.0", "0.2.0"));
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
    });
    expect(decision.action).toBe("loop-guard-tripped");
  });

  it("fails open when the fetch errors, treating the command as fine to proceed", async () => {
    const decision = await decidePreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://127.0.0.1:1/nope.json",
    });
    expect(decision.action).toBe("fail-open");
  });
});

describe("runPreflight self-refresh", () => {
  it("calls the injected reexec with the exact target version on self-refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ devtools: { latest: "0.2.0", minimum: "0.2.0" } }),
      }),
    );
    const reexec = vi.fn();
    const decision = await runPreflight({
      currentVersion: "0.1.0",
      argv: ["cron", "list"],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
      registry: "http://localhost:4873",
      reexec: reexec as never,
    });
    expect(decision.action).toBe("self-refresh");
    expect(reexec).toHaveBeenCalledWith({
      version: "0.2.0",
      argv: ["cron", "list"],
      registry: "http://localhost:4873",
    });
  });

  it("does not call reexec when up to date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ devtools: { latest: "0.1.0", minimum: "0.1.0" } }),
      }),
    );
    const reexec = vi.fn();
    await runPreflight({
      currentVersion: "0.1.0",
      argv: [],
      skipPreflight: false,
      refresh: false,
      manifestUrl: "http://example.invalid/manifest.json",
      reexec: reexec as never,
    });
    expect(reexec).not.toHaveBeenCalled();
  });
});

describe("isDevMode", () => {
  it("is true for version 0.0.0-dev regardless of path", () => {
    expect(isDevMode("0.0.0-dev", "/some/random/path")).toBe(true);
  });

  it("is true when the package directory is not under node_modules", () => {
    expect(isDevMode("1.2.3", "/home/sloan/code/DevDogsUGA/Backstage/packages/devtools")).toBe(
      true,
    );
  });

  it("is false when the package directory is under node_modules (a real install)", () => {
    expect(
      isDevMode(
        "1.2.3",
        "/home/sloan/.cache/pnpm/dlx/abc123/node_modules/@devdogsuga/devtools",
      ),
    ).toBe(false);
  });
});
