import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component, so there is no jsdom and
 * no React Testing Library — this package has no JSX at all.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["src/**/*.test.ts"] },
  }),
);
