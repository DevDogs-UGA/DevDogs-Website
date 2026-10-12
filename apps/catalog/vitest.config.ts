import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";
import type { Plugin } from "vite";

/**
 * The Worker imports `cloudflare:workers` and `cloudflare:workflows`, which
 * plain Vitest (no workerd underneath) cannot resolve. Claiming them as
 * ordinary virtual modules keeps them nodes in Vite's graph so a test can
 * still `vi.mock` them; the placeholder bodies are enough for the modules that
 * only extend or throw them.
 */
const cloudflareModulesStub: Plugin = {
  name: "cloudflare-modules-stub",
  resolveId(id) {
    if (id.startsWith("cloudflare:")) return id;
  },
  load(id) {
    if (id === "cloudflare:workers") {
      return "export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export const env = {};";
    }
    if (id === "cloudflare:workflows") {
      return "export class NonRetryableError extends Error { constructor(message) { super(message); this.name = 'NonRetryableError'; } }";
    }
  },
};

/** wrangler.jsonc bundles `*.csv` as text (the building data); under Vitest this does the same. */
const csvAsText: Plugin = {
  name: "csv-as-text",
  enforce: "pre",
  transform(code, id) {
    if (id.endsWith(".csv"))
      return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
};

export default mergeConfig(
  nodePreset,
  defineConfig({
    plugins: [cloudflareModulesStub, csvAsText],
    resolve: {
      alias: { "~": resolve(import.meta.dirname, "src") },
    },
    test: {
      include: [
        "src/**/*.test.ts",
        "test/**/*.test.ts",
        "scripts/**/*.test.ts",
      ],
    },
  }),
);
