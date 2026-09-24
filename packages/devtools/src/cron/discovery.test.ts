import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot, resetRepoRootCacheForTests } from "../repo/root.js";
import { discoverWranglerConfigs, parseWrangler } from "./discovery.js";

/**
 * Restored from DevDogsUGA's original `src/cron/discovery.test.ts` (see
 * `../../MOVED-TESTS.md`). The original asserted `discoverWranglerConfigs()`
 * against the real `apps/*` tree; this one asserts it against the committed
 * contract-test fixture (`test/fixture-repo/`), which ships exactly one app
 * (`demo-app`) with a real `wrangler.jsonc` — enough to exercise "discovered
 * by presence of the file, not an allowlist" without a real DevDogsUGA
 * checkout.
 */

const FIXTURE_ROOT = new URL("../../test/fixture-repo/", import.meta.url)
  .pathname;

describe("parseWrangler", () => {
  it("accepts JSONC without stripping // from URL strings", () => {
    const dir = join(
      tmpdir(),
      `devtools-wrangler-${process.pid}-${Date.now()}`,
    );
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "wrangler.jsonc");
    try {
      writeFileSync(
        path,
        '{\n  // comment\n  "name": "development-test",\n  "vars": { "ORIGIN": "https://example.test/path" },\n}\n',
      );
      expect(parseWrangler(path)).toMatchObject({ name: "development-test" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("discoverWranglerConfigs", () => {
  const previousRoot = process.env.DEVTOOLS_TEST_REPO_ROOT;

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
    else process.env.DEVTOOLS_TEST_REPO_ROOT = previousRoot;
    resetRepoRootCacheForTests();
  });

  it("discovers every app with wrangler.jsonc instead of using an allowlist", () => {
    process.env.DEVTOOLS_TEST_REPO_ROOT = FIXTURE_ROOT;
    resetRepoRootCacheForTests();

    const appsRoot = join(findRepoRoot(), "apps");
    const expected = readdirSync(appsRoot)
      .filter((app) => existsSync(join(appsRoot, app, "wrangler.jsonc")))
      .sort();
    expect(expected).toEqual(["demo-app"]);
    expect(discoverWranglerConfigs().map(({ app }) => app)).toEqual(expected);
  });
});
