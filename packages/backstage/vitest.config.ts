import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

// Backstage's own checkout is not a DevDogsUGA clone; see cli-core's
// vitest.config.ts for why tests point `DEVTOOLS_TEST_REPO_ROOT` at a
// stand-in directory. The same one serves here.
const repoRootFixture = fileURLToPath(
  new URL("../cli-core/test-fixtures/repo-root", import.meta.url),
);

export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
      env: { DEVTOOLS_TEST_REPO_ROOT: repoRootFixture },
    },
  }),
);
