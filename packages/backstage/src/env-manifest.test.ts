import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The operator manifest (`BWS_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`,
 * `SENTRY_AUTH_TOKEN` and friends) is loaded from the running CLI's own
 * `env.ts`, so each published CLI ships one. They must declare the same keys:
 * `env push` routes by the registry (`BWS_ACCESS_TOKEN` is refused by name,
 * `SUPABASE_ACCESS_TOKEN` reaches only `production-apply`), and `devtools env
 * example` renders `.env.example` from it. Two copies that drifted would make
 * the same repository classify the same key two ways depending on which CLI
 * ran.
 *
 * One file, copied. Until the cutover settles where the keys that belong to
 * contributors (`DEV_VPN_HOST`, `SKIP_ENV_VALIDATION`, `DEVTOOLS_TELEMETRY`)
 * and the ones that belong to officers separate, they are byte-identical, and
 * this is what keeps them so.
 */
describe("the operator manifest", () => {
  it("is the same file devtools ships", () => {
    const ours = readFileSync(new URL("../env.ts", import.meta.url), "utf8");
    const devtools = readFileSync(
      new URL("../../devtools/env.ts", import.meta.url),
      "utf8",
    );
    expect(ours).toBe(devtools);
  });
});
