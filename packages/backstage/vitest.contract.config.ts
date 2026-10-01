import { defineConfig } from "vitest/config";

/**
 * Separate from `vitest.config.ts` (`pnpm test`) on purpose: the contract
 * tests pack the real package and install the tarball, which is too slow for
 * the default suite. See `test/contract/backstage.contract.test.ts`.
 */
export default defineConfig({
  test: {
    include: ["test/contract/**/*.test.ts"],
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
    // One real `pnpm install` per run; parallel workers would just contend on
    // the same pnpm store lock for no benefit here.
    fileParallelism: false,
  },
});
