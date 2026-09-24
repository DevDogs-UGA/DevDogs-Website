import { defineConfig } from "vitest/config";

/**
 * Separate from `vitest.config.ts` (`pnpm test`) on purpose — see
 * `test/contract/devtools.contract.test.ts`'s header for why: a real
 * `pnpm install` per run makes this too slow for the default suite, and it
 * needs none of that config's `DEVTOOLS_TEST_REPO_ROOT` fixture (it builds
 * and installs its own real repo instead).
 */
export default defineConfig({
  test: {
    include: ["test/contract/**/*.test.ts"],
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
    // One real `pnpm install`-backed fixture per run; parallel workers would
    // just contend on the same pnpm store lock for no benefit here.
    fileParallelism: false,
  },
});
