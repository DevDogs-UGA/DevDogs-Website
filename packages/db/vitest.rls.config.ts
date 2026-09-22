import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * Slot for a live-DB test lane, kept for parity with `@devdogsuga/supabase`'s
 * `test:rls` (which needed a running local Supabase stack and so could not
 * join the default `pnpm test`).
 *
 * This package ships no live-DB tests of its own: the RLS persona suite this
 * config used to run (`packages/supabase/testing/**` in the product repo)
 * exercises DevDogsUGA's actual Postgres schema — specific tables, columns
 * and RPCs (`profile`, `reports`, moderation policy, attendance, …) — which
 * is business/repo data, not framework, per the carveout's "repo-specific
 * data never publishes" rule. It stays in DevDogsUGA and should be retargeted
 * to import its clients from `@devdogsuga/db/client` and `@devdogsuga/db/server`
 * instead of the local `@devdogsuga/supabase` package (Wave 3 cutover work).
 *
 * `passWithNoTests` keeps `pnpm --filter @devdogsuga/db test:rls` green with
 * nothing under `testing/` yet; a future live-DB suite that genuinely belongs
 * to this package (e.g. testing the client factories themselves against a
 * real stack) has a config ready to write into.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["testing/**/*.test.ts"],
      passWithNoTests: true,
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
