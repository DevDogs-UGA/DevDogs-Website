import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLayoutCacheForTests } from "../repo/layout.js";
import { resetRepoRootCacheForTests } from "../repo/root.js";
import { manifestPaths } from "./discovery.js";

const fixtures = fileURLToPath(
  new URL("../../test-fixtures/", import.meta.url),
);
const saved = process.env.DEVTOOLS_TEST_REPO_ROOT;

function enter(name: string): void {
  process.env.DEVTOOLS_TEST_REPO_ROOT = `${fixtures}${name}`;
  resetRepoRootCacheForTests();
  resetLayoutCacheForTests();
}

/** The scanned manifests, relative to the fixtures, without the CLI's own. */
function scanned(): string[] {
  return manifestPaths()
    .slice(0, -1)
    .map((path) => relative(fixtures, path));
}

beforeEach(() => {
  resetRepoRootCacheForTests();
  resetLayoutCacheForTests();
});

afterEach(() => {
  if (saved === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = saved;
  resetRepoRootCacheForTests();
  resetLayoutCacheForTests();
});

describe("manifestPaths", () => {
  it("scans a DevDogsUGA checkout without a platform", () => {
    enter("devdogsuga-repo");
    expect(scanned()).toEqual(["devdogsuga-repo/supabase/env.ts"]);
  });

  it("scans both repos from a Backstage checkout", () => {
    enter("backstage-repo");
    // Backstage's platform shadows DevDogsUGA's stale copy; the CLIs' own
    // packages are left to their own manifests; supabase/ and docs/ come from
    // devdogsuga/.
    expect(scanned()).toEqual([
      "backstage-repo/apps/platform/src/env.ts",
      "backstage-repo/devdogsuga/apps/schedule-builder/src/env.ts",
      "backstage-repo/devdogsuga/docs/env.ts",
      "backstage-repo/devdogsuga/supabase/env.ts",
    ]);
  });
});
