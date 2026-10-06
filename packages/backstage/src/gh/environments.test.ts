import { beforeAll, describe, expect, it } from "vitest";
import { applyOnlyKeys, planOnlyKeys } from "@devdogsuga/env";
import { buildDesiredSettings } from "../github/settings/desired.js";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import {
  accepts,
  acceptedBy,
  acceptsKey,
  GITHUB_ENVIRONMENTS,
  githubTargets,
  routeTo,
} from "./environments.js";

/**
 * The routing that IS the reviewer gate.
 *
 * Restored from DevDogsUGA's original `src/gh/environments.test.ts` (see
 * `../../MOVED-TESTS.md`) — near-verbatim. Everything here except
 * `applyOnlyKeys()`/`APPLY_KEYS` operates on a bare key STRING and a target
 * name (`accepts`/`routeTo`/`acceptedBy`/`acceptsKey` in `./environments.ts`
 * never look the key up in the registry — only `applyOnlyKeys()`/
 * `planOnlyKeys()` do), so the "ordinary secret" examples below
 * (`DISCORD_TOKEN`, `CRON_SECRET`, `PROJECT_REF`) do not need to be declared
 * anywhere to exercise the routing rules; only `SUPABASE_ACCESS_TOKEN`'s
 * `tier: "apply"` classification has to come from a real manifest, and it
 * does — devtools' OWN operator manifest (`packages/devtools/env.ts`) is now
 * unconditionally part of the registry (`env/discovery.ts`'s
 * `ownManifestPath()`, restoring the gap `MOVED-TESTS.md` used to describe),
 * so `loadRegistry()` sees it even against the bare default test fixture.
 *
 * The invariant: an environment that receives an apply-tier credential must be
 * one whose desired settings (`github/settings/desired.ts`) REQUIRE reviewers.
 * `production` is that environment; `preflight` and `staging` (and the
 * variables-only `production-build`, which is not routed at all) never receive
 * one. The failure to guard against is "the push succeeded and put the token
 * somewhere that deploys unreviewed", not "the push errored".
 */

beforeAll(async () => {
  await loadRegistry();
});

// A literal, because vitest collects the `it` blocks before `beforeAll` fills
// the registry. The completeness test pins `applyOnlyKeys()` to exactly this
// set (devtools' own SUPABASE_ACCESS_TOKEN, the only `tier: "apply"` key
// devtools declares), and the first `routeTo` test re-asserts the tie here.
const APPLY_KEYS = ["SUPABASE_ACCESS_TOKEN"] as const;
const APPLY_KEY = APPLY_KEYS[0];

describe("githubTargets", () => {
  it("gives every project exactly one environment", () => {
    expect(githubTargets("production")).toEqual(["production"]);
    expect(githubTargets("staging")).toEqual(["staging"]);
    expect(githubTargets("preflight")).toEqual(["preflight"]);
  });

  it("does not model production-apply or production-build", () => {
    expect([...GITHUB_ENVIRONMENTS]).toEqual([
      "preflight",
      "staging",
      "production",
    ]);
  });

  it("returns nothing for a project it does not know", () => {
    expect(githubTargets("devdogs-nonsense")).toEqual([]);
  });
});

describe("the reviewer gate", () => {
  it("⚠️ only environments requiring reviewers accept an apply-tier key", () => {
    // THE INVARIANT, stated against the desired GitHub settings rather than
    // restated here: any routed environment that accepts an apply-tier key
    // must be one whose desired settings require reviewers.
    const desired = buildDesiredSettings([]);
    for (const key of APPLY_KEYS) {
      for (const environment of GITHUB_ENVIRONMENTS) {
        if (!accepts(environment, key)) continue;
        const policy = desired.environments.find((e) => e.name === environment);
        expect(
          policy?.requireReviewers,
          `${key} reaches ${environment}, which must require reviewers`,
        ).toBe(true);
      }
    }
  });

  it("asserts production requires reviewers and takes the apply-tier key", () => {
    // POSITIVE CONTROL for the loop above: it is not vacuous because
    // `production` really does accept the key, and really is gated.
    const production = buildDesiredSettings([]).environments.find(
      (e) => e.name === "production",
    )!;
    expect(production.requireReviewers).toBe(true);
    expect(production.preventSelfReview).toBe(true);
    expect(accepts("production", APPLY_KEY)).toBe(true);
  });

  it("never gives staging, preflight or production-build an apply-tier key", () => {
    for (const key of APPLY_KEYS) {
      expect(accepts("staging", key), `${key} in staging`).toBe(false);
      expect(accepts("preflight", key), `${key} in preflight`).toBe(false);
    }
    // production-build is not a routed environment at all, and holds only
    // variables; an unknown name is refused by the audit's predicate.
    for (const key of APPLY_KEYS) {
      expect(acceptsKey(key, "production-build"), key).toBe(false);
    }
  });

  it("describes the same four environments `github settings` checks", () => {
    const names = buildDesiredSettings([]).environments.map((e) => e.name);
    for (const environment of GITHUB_ENVIRONMENTS) {
      expect(names).toContain(environment);
    }
    expect(names).toContain("production-build");
    expect(names).not.toContain("production-apply");
  });
});

describe("routeTo", () => {
  it("tests the same set the registry derives", () => {
    expect(applyOnlyKeys()).toEqual([...APPLY_KEYS]);
  });

  it("sends an apply-only credential to production", () => {
    expect(routeTo("production", APPLY_KEY)).toBe("production");
  });

  it("sends every ordinary secret to production", () => {
    expect(routeTo("production", "DISCORD_TOKEN")).toBe("production");
  });

  it("routes every apply-only key, not just the first", () => {
    // A set, not a convention: loops over the DERIVED set so a new
    // `tier: "apply"` declaration is covered without editing this file.
    for (const key of applyOnlyKeys()) {
      expect(routeTo("production", key)).toBe("production");
    }
  });

  it("gives an apply-only key no home in staging or preflight", () => {
    // Not an error: it belongs to production, and these simply have no place
    // for it. The caller skips rather than refusing.
    expect(routeTo("staging", APPLY_KEY)).toBeNull();
    expect(routeTo("preflight", APPLY_KEY)).toBeNull();
  });

  it("routes ordinary secrets in the single-target projects", () => {
    expect(routeTo("staging", "CRON_SECRET")).toBe("staging");
    expect(routeTo("preflight", "CRON_SECRET")).toBe("preflight");
  });
});

describe("accepts", () => {
  it("⚠️ refuses EVERY apply-only key in staging and preflight", () => {
    // By name and per key, not `applyOnlyKeys().every(...)`: a derived set that
    // emptied would make the loop vacuous and the test green.
    for (const key of APPLY_KEYS) {
      expect(accepts("staging", key), `${key} in staging`).toBe(false);
      expect(accepts("preflight", key), `${key} in preflight`).toBe(false);
    }
    // POSITIVE CONTROL: the mechanism refuses these and nothing else.
    expect(accepts("staging", "DISCORD_TOKEN")).toBe(true);
    expect(accepts("preflight", "CRON_SECRET")).toBe(true);
  });

  it("gives production the whole project, apply-tier included", () => {
    expect(accepts("production", APPLY_KEY)).toBe(true);
    expect(accepts("production", "DISCORD_TOKEN")).toBe(true);
    expect(accepts("production", "CLOUDFLARE_API_TOKEN")).toBe(true);
    expect(accepts("production", "PROJECT_REF")).toBe(true);
  });

  it("sends plan-tier keys to preflight and production, never staging", () => {
    // Empty when no loaded manifest declares a `tier: "plan"` key, so this is
    // a pin on the derivation rather than on particular names.
    for (const key of planOnlyKeys()) {
      expect(accepts("staging", key), `${key} in staging`).toBe(false);
      expect(accepts("preflight", key), `${key} in preflight`).toBe(true);
      expect(accepts("production", key), `${key} in production`).toBe(true);
    }
  });
});

describe("acceptedBy", () => {
  it("gives an ordinary production key the one environment", () => {
    expect(acceptedBy("production", "DISCORD_TOKEN")).toEqual(["production"]);
  });

  it("gives an apply-only key production and only production", () => {
    // What `env audit` compares a found copy against.
    for (const key of APPLY_KEYS) {
      expect(acceptedBy("production", key), key).toEqual(["production"]);
      expect(acceptedBy("staging", key), key).toEqual([]);
      expect(acceptedBy("preflight", key), key).toEqual([]);
    }
  });

  it("stays a single-element answer for the one-environment projects", () => {
    expect(acceptedBy("staging", "CRON_SECRET")).toEqual(["staging"]);
  });
});

describe("acceptsKey", () => {
  // The predicate `env audit` passes as `AuditInput.accepted`. It lives in this
  // module rather than at that call site because `runEnvAudit` cannot be
  // unit-tested without mocking three remote services.
  it("agrees with accepts() on a known environment", () => {
    expect(acceptsKey("DISCORD_TOKEN", "production")).toBe(true);
    // ⚠️ The gate, through the audit's door: a copy of an apply-tier key found
    // in an environment without required reviewers must read as misplaced.
    for (const key of APPLY_KEYS) {
      expect(acceptsKey(key, "production"), key).toBe(true);
      expect(acceptsKey(key, "staging"), key).toBe(false);
      expect(acceptsKey(key, "preflight"), key).toBe(false);
    }
  });

  it("refuses an environment it does not recognise", () => {
    // Fails CLOSED. The name comes from whatever `gh` listed, and this decides
    // whether a found copy is reported as a stray. That includes the removed
    // `production-apply`, should a copy linger there.
    expect(acceptsKey("DISCORD_TOKEN", "production-apply")).toBe(false);
    expect(acceptsKey("DISCORD_TOKEN", "production-legacy")).toBe(false);
    expect(acceptsKey("DISCORD_TOKEN", "")).toBe(false);
  });
});
