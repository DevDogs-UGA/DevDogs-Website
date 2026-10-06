import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverRepoRoot,
  findRepoRoot,
  resetRepoRootCacheForTests,
} from "./root.js";

let dir: string;
const savedEnv = process.env.DEVTOOLS_TEST_REPO_ROOT;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "devtools-root-test-"));
  resetRepoRootCacheForTests();
  delete process.env.DEVTOOLS_TEST_REPO_ROOT;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetRepoRootCacheForTests();
  if (savedEnv === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = savedEnv;
});

function writeRepoMarker(root: string): void {
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "devdogs-monorepo" }),
  );
}

describe("discoverRepoRoot", () => {
  it("finds the repo root by walking up from a nested directory", () => {
    writeRepoMarker(dir);
    const nested = join(dir, "apps", "platform", "src");
    mkdirSync(nested, { recursive: true });

    expect(discoverRepoRoot(nested)).toBe(dir);
  });

  it("returns null when no ancestor carries the marker", () => {
    mkdirSync(join(dir, "nested"), { recursive: true });
    expect(discoverRepoRoot(join(dir, "nested"))).toBeNull();
  });

  it("matches a Backstage checkout too", () => {
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "backstage" }),
    );

    expect(discoverRepoRoot(dir)).toBe(dir);
  });

  it("does not match a pnpm-workspace.yaml whose package.json has some other name", () => {
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "something-else" }),
    );

    expect(discoverRepoRoot(dir)).toBeNull();
  });

  it("does not match a directory with the right package.json name but no pnpm-workspace.yaml", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "devdogs-monorepo" }),
    );
    expect(discoverRepoRoot(dir)).toBeNull();
  });
});

describe("findRepoRoot", () => {
  it("throws a clear error when not inside a DevDogsUGA clone", () => {
    mkdirSync(join(dir, "nested"), { recursive: true });
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(join(dir, "nested"));
    try {
      expect(() => findRepoRoot()).toThrow(
        "run this from inside a DevDogsUGA clone",
      );
    } finally {
      cwd.mockRestore();
    }
  });

  it("memoizes the result across calls", () => {
    writeRepoMarker(dir);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const first = findRepoRoot();
      // Removing the marker after the first call proves the second call
      // reused the cached value rather than re-walking the filesystem.
      rmSync(join(dir, "pnpm-workspace.yaml"));
      expect(findRepoRoot()).toBe(first);
    } finally {
      cwd.mockRestore();
    }
  });

  it("honors DEVTOOLS_TEST_REPO_ROOT without touching the filesystem", () => {
    process.env.DEVTOOLS_TEST_REPO_ROOT = "/fake/devdogs-monorepo";
    expect(findRepoRoot()).toBe("/fake/devdogs-monorepo");
  });
});
