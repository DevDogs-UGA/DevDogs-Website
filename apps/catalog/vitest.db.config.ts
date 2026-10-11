import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";
import type { Plugin } from "vite";

/** See vitest.config.ts. */
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

/**
 * Tests that need a real Postgres: `DB_URL` (an admin connection, for example
 * the local Supabase stack's `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
 * Each file builds its own throwaway database from supabase/schemas, so they
 * never touch the data in the one `DB_URL` names. Separate from the default
 * config so `pnpm test` stays hermetic.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    plugins: [cloudflareModulesStub],
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      include: ["src/**/*.db-test.ts", "test/**/*.db-test.ts"],
      testTimeout: 60_000,
      hookTimeout: 120_000,
      // One throwaway database per file, created and dropped by that file.
      fileParallelism: false,
      passWithNoTests: true,
    },
  }),
);
