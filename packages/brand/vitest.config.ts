import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component, so there is no jsdom and
 * no React Testing Library. The templates are JSX, but Satori consumes the
 * plain objects the automatic runtime produces, so tests assert on those.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    oxc: { jsx: { runtime: "automatic" } },
    test: { include: ["src/**/*.test.ts?(x)"] },
  }),
);
