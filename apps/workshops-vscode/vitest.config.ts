import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

export default mergeConfig(
  nodePreset,
  defineConfig({
    // The integration test replays every step range of both workshop repos
    // through git, so it gets a generous ceiling.
    test: { include: ["src/**/*.test.ts"], testTimeout: 120_000 },
  }),
);
