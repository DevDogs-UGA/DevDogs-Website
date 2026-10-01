/**
 * Minimal env manifest, matching real DevDogsUGA `env.ts` conventions:
 * every variable goes through `define()` before `declare()` will accept it
 * (see `@devdogsuga/env`'s `src/define.ts` header for why that is
 * enforced rather than merely documented).
 *
 * devtools' `env/discovery.ts` imports this file (via `repo/tsx-loader.ts`)
 * as one of the manifests that populates the registry `env example`,
 * `env audit`, etc. read from — this is the fixture's exercise of "env
 * discovery and module identity" per the contract test.
 */
import { z } from "zod";
import { declare, define } from "@devdogsuga/env";

const DEMO_API_KEY = define(z.string().min(1), {
  doc: "API key for the fixture's demo integration.",
  scope: "environment",
  secrecy: "secret",
});

const DEMO_PUBLIC_URL = define(z.string().url(), {
  doc: "Public base URL the fixture app is served from.",
  scope: "default",
  secrecy: "public",
});

declare({
  source: "demo-package",
  server: {
    DEMO_API_KEY,
  },
  client: {
    DEMO_PUBLIC_URL,
  },
});
