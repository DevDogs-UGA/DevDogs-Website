/**
 * Minimal fixture manifest for devtools' own test suite (Backstage has no
 * real DevDogsUGA repo to scan) — mirrors just enough of the real
 * `apps/sandbox/env.ts`'s `PLATFORM_REST_URL` declaration for
 * `cf/local-env.test.ts`'s `createTemporaryWranglerEnv` case, which needs a
 * real registry entry with `source: "sandbox"` rather than an injected one.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "sandbox",
  server: {
    PLATFORM_REST_URL: define(z.string().min(1).optional(), {
      doc: "Fixture copy for devtools' own tests.",
      scope: "environment",
      secrecy: "public",
    }),
  },
});
