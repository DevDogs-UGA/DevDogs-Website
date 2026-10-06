/**
 * A richer fixture manifest than demo-package's, for devtools' own unit tests
 * restored from DevDogsUGA's original suite (see the package README and
 * `../../../MOVED-TESTS.md`). Classification (scope/secrecy/tier/minted/
 * narrowed/localStack) mirrors what the equivalent real DevDogsUGA key
 * carries — see MOVED-TESTS.md for the mapping — so `selectForPush`,
 * `pushToGithub` and `runEnvAudit`'s real routing logic has something
 * representative to classify. Names are deliberately DIFFERENT from the real
 * DevDogsUGA keys they stand in for (no `DISCORD_TOKEN`/`DB_URL`/etc. here):
 * this is devtools' own fixture, not a copy of DevDogsUGA's declarations, and
 * giving it different names keeps that distinction visible in a test's
 * output.
 */
import { z } from "zod";
import { declare, define } from "@devdogsuga/env";

declare({
  source: "demo-registry",
  server: {
    // Ordinary deployed secret — the common case a push sends to Bitwarden
    // and a GitHub *secret*.
    DEMO_TOKEN: define(z.string(), {
      doc: "An ordinary per-environment secret, for routing tests.",
      scope: "environment",
      secrecy: "secret",
    }),
    // A second ordinary secret, standing in for the "two secrets in the same
    // push" shape (DevDogsUGA's CRON_SECRET) without colliding with
    // DEMO_TOKEN's own single-key assertions.
    DEMO_SECOND_TOKEN: define(z.string(), {
      doc: "A second ordinary per-environment secret.",
      scope: "environment",
      secrecy: "secret",
    }),
    // `narrowed: true` — the one key a `preflight`-target push/pull/audit may
    // carry, standing in for DB_URL's migration-planner role.
    DEMO_NARROWED_SECRET: define(z.string(), {
      doc: "A secret narrowed to the preflight target only.",
      scope: "environment",
      secrecy: "secret",
      narrowed: true,
    }),
    // Public, per-environment — routes to Bitwarden AND a GitHub *variable*,
    // standing in for PROJECT_REF.
    DEMO_VARIABLE: define(z.string(), {
      doc: "A public per-environment value, routed as a GitHub variable.",
      scope: "environment",
      secrecy: "public",
    }),
    // The five `localStack: true` values (API_URL, PUBLISHABLE_KEY, REST_URL,
    // S3_PROTOCOL_REGION, STORAGE_S3_URL in the real registry): supplied by
    // the local Docker stack in development, but still routed to a deployed
    // target's variable store, which is the trap `localStack: true` exists to
    // avoid.
    DEMO_LOCAL_STACK_ONE: define(z.string(), {
      doc: "One of the localStack-supplied public values.",
      scope: "environment",
      secrecy: "public",
      localStack: true,
    }),
    DEMO_LOCAL_STACK_TWO: define(z.string(), {
      doc: "A second localStack-supplied public value.",
      scope: "environment",
      secrecy: "public",
      localStack: true,
    }),
    // Committed, same everywhere — never pushed, never a variable. Stands in
    // for DEPLOY_ENV.
    DEMO_COMMITTED: define(z.string().default("fixture"), {
      doc: "A committed constant, same in every environment.",
      scope: "default",
      secrecy: "public",
      commented: true,
    }),
    // `minted: true` — signed at deploy time, no stored copy anywhere. Stands
    // in for SANDBOX_PROXY_TOKEN.
    DEMO_MINTED: define(z.string().optional(), {
      doc: "A credential minted at deploy time; nothing stores it.",
      scope: "environment",
      secrecy: "secret",
      minted: true,
    }),
    // Public, per-environment, with an `example` that is a formula
    // referencing another declared key — the `derivationOf()` shape
    // `env init --target` renders as a `$VAR` line, standing in for
    // DevDogsUGA's `NEXT_PUBLIC_SUPABASE_URL: "$API_URL"`.
    DEMO_DERIVED: define(z.string(), {
      doc: "A public value whose declared derivation is another key's value.",
      scope: "environment",
      secrecy: "public",
      example: "$DEMO_VARIABLE",
    }),
    // An ordinary secret alongside `tier: "apply"` devtools own manifest
    // key (SUPABASE_ACCESS_TOKEN), standing in for
    // SUPABASE_OAUTH_CLIENT_SECRET — an ordinary production
    // secret that is NOT itself apply-tier.
    DEMO_APPLY_ADJACENT: define(z.string(), {
      doc: "An ordinary secret that is not apply-tier, so it also reaches staging.",
      scope: "environment",
      secrecy: "secret",
    }),
  },
});
