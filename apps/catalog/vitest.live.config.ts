import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * Contract tests against a DEPLOYED catalog (`CATALOG_URL`, for example
 * https://api-staging.devdogsuga.org/catalog/v1): the same checks as the local
 * contract tests, over the network. Used at integration and by the Gate's
 * post-deploy verification; never part of `pnpm test`.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    resolve: {
      alias: { "~": resolve(import.meta.dirname, "src") },
    },
    test: {
      include: ["test/**/*.live-test.ts"],
      testTimeout: 30_000,
      passWithNoTests: true,
    },
  }),
);
