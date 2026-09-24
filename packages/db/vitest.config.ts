import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

// `src/server/index.ts` opens with `import "server-only"`, which throws
// outside a bundler that resolves the package's `react-server` export
// condition to a no-op. This package's own tests import that module
// directly (not through a consumer's Next.js config), so — per the
// README's "@devdogsuga/db/server" section — they alias the package to an
// empty stub instead of relying on `server.deps.inline` (that flag only
// matters when Vitest would otherwise hand the *published* package to
// Node's native `import()`, which isn't the case for in-repo `src` imports).
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["src/**/*.test.ts"] },
    resolve: {
      alias: {
        "server-only": fileURLToPath(
          new URL("./test/stubs/server-only.ts", import.meta.url),
        ),
      },
    },
  }),
);
