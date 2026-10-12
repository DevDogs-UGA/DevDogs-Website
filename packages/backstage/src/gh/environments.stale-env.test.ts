import { describe, expect, it, vi } from "vitest";

/**
 * DEVTOOLS-7: `TypeError: env.buildKeys is not a function` from `buildOnly()`,
 * thrown by `backstage env audit` (release 0.1.18) when the checkout's env
 * registry predates `build: true`. The guard in `buildOnly()` makes such a
 * registry route nothing instead of crashing; this pins it with a registry
 * that really has no `buildKeys`.
 */
vi.mock("@devdogsuga/cli-core/env/discovery", () => ({
  assertRegistryLoaded: () => undefined,
}));
vi.mock("@devdogsuga/cli-core/repo/peers", () => ({
  getEnvSync: () => ({
    applyOnlyKeys: () => [],
    planOnlyKeys: () => [],
    variableKeys: () => ["SOME_VARIABLE"],
    // no buildKeys: that is the point
  }),
}));

describe("a registry without buildKeys()", () => {
  it("routes no build keys instead of throwing", async () => {
    const { accepts, acceptedBy, buildOnly } =
      await import("./environments.js");
    expect(buildOnly()).toEqual([]);
    for (const environment of ["staging-build", "production-build"]) {
      expect(() => accepts(environment, "SOME_VARIABLE")).not.toThrow();
      expect(accepts(environment, "SOME_VARIABLE")).toBe(false);
    }
    expect(() => acceptedBy("production", "SOME_VARIABLE")).not.toThrow();
  });
});
