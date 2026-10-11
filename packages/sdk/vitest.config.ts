import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The node preset: nothing here mounts a component, so there is no jsdom and
 * no React Testing Library. The brand templates are JSX, but Satori consumes
 * the plain objects the automatic runtime produces, so tests assert on those.
 *
 * `src/db/server/index.ts` opens with `import "server-only"`, which throws
 * outside a bundler that resolves the package's `react-server` export
 * condition to a no-op. The tests import that module directly, so they alias
 * the package to an empty stub.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    oxc: { jsx: { runtime: "automatic" } },
    test: { include: ["src/**/*.test.ts?(x)"] },
    resolve: {
      alias: {
        "server-only": fileURLToPath(
          new URL("./test-stubs/stubs/server-only.ts", import.meta.url),
        ),
      },
    },
  }),
);
