import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLayoutCacheForTests } from "./repo/layout.js";
import { resetRepoRootCacheForTests } from "./repo/root.js";
import type * as WorkersModule from "./workers.js";
import { parseWorkerEntries } from "./workers.js";

describe("parseWorkerEntries", () => {
  it("reads the bare paths workers.json has always held", () => {
    expect(parseWorkerEntries(["apps/platform", "apps/sandbox"])).toEqual([
      { path: "apps/platform" },
      { path: "apps/sandbox" },
    ]);
  });

  it("reads an object entry with its per-app data", () => {
    const smoke = { hosts: { staging: "s", production: "p" } };
    expect(parseWorkerEntries([{ path: "apps/platform", smoke }])).toEqual([
      { path: "apps/platform", smoke },
    ]);
  });

  it("allows the two to be mixed, so the field can arrive one app at a time", () => {
    expect(
      parseWorkerEntries([
        "apps/sandbox",
        { path: "apps/platform", smoke: {} },
      ]),
    ).toEqual([{ path: "apps/sandbox" }, { path: "apps/platform", smoke: {} }]);
  });

  it("names the entry it cannot read", () => {
    expect(() => parseWorkerEntries(["apps/platform", 3])).toThrow(/entry 1/);
    expect(() => parseWorkerEntries([{ smoke: {} }])).toThrow(/entry 0/);
    expect(() => parseWorkerEntries({})).toThrow(/array/);
  });
});

describe("workerEntries by layout", () => {
  const fixture = (name: string): string =>
    fileURLToPath(new URL(`../test-fixtures/${name}`, import.meta.url));

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    resetRepoRootCacheForTests();
    resetLayoutCacheForTests();
  });

  async function inside(name: string): Promise<typeof WorkersModule> {
    vi.resetModules();
    vi.stubEnv("DEVTOOLS_TEST_REPO_ROOT", fixture(name));
    const root = await import("./repo/root.js");
    root.resetRepoRootCacheForTests();
    (await import("./repo/layout.js")).resetLayoutCacheForTests();
    return import("./workers.js");
  }

  it("reads Backstage's workers.json, schedule-builder included", async () => {
    const workers = await inside("backstage-repo");
    expect(workers.workerApps()).toEqual(["platform", "schedule-builder"]);
    expect(workers.workerAppDir("apps/schedule-builder")).toContain(
      "backstage-repo/devdogsuga/apps/schedule-builder",
    );
  });

  it("treats a DevDogsUGA without workers.json as managing no Workers", async () => {
    const workers = await inside("devdogsuga-repo");
    expect(workers.workerApps()).toEqual([]);
    expect(workers.isWorkerApp("platform")).toBe(false);
  });
});
