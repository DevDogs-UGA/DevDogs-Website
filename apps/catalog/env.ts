/**
 * The catalog Worker's environment manifest. NOTHING IMPORTS THIS FILE; the
 * Worker reads its bindings through `CatalogEnv` (src/bindings.ts). It exists
 * for tooling, which finds a manifest by filename: `backstage deploy catalog`
 * builds the Worker's `--secrets-file` from the keys declared here, and
 * `env audit` reads the same list to tell a Worker secret that is meant to be
 * there from an orphan. A Worker without a manifest cannot be deployed by the
 * pipeline.
 *
 * It sits at the package root, beside `wrangler.jsonc`, the way
 * `apps/study-group-finder/env.ts` does, because `src/env.ts` would suggest the
 * Worker imports it.
 *
 * ⚠️ Deliberately NOT declared here: `DB_URL`. A key declared by this app is
 * uploaded to the Worker as a secret on every deploy, and `DB_URL` is the full
 * Postgres connection string. The deployed catalog reaches its database
 * through Hyperdrive (a wrangler binding, `HYPERDRIVE`) and must never hold
 * the string itself. `DB_URL` appears in `CatalogEnv` for local development
 * only, where `scripts/local-env.ts` finds it.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "catalog",
  server: {
    // Declared by the platform too, with the same metadata. The catalog has no
    // Sentry project of its own: it reports to the platform's, tagged
    // `worker:catalog` (src/sentry.ts), so it reads the platform's DSN.
    PLATFORM_SENTRY_DSN: define(z.string().url().optional(), {
      doc:
        "Sentry ingest DSN for this app's Sentry project (see " +
        "@devdogsuga/telemetry). Optional -- empty skips Sentry.init " +
        "entirely, which is the state before the org is onboarded and the " +
        "state of local development. Reaches the Worker like every other " +
        "environment variable.",
      scope: "environment",
      secrecy: "public",
      build: true,
    }),
  },
});
