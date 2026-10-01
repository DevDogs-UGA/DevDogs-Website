import { describe, expect, it } from "vitest";
import { FALLBACK_SMOKE, smokeConfigFor } from "./smoke-config.js";

const custom = {
  hosts: { staging: "s.example.org", production: "example.org" },
  publicPaths: ["/", "/about"],
  protectedPath: "/admin",
  protectedRedirectPrefix: "/login",
};

describe("smokeConfigFor", () => {
  it("reads the smoke field of the app's workers.json entry", () => {
    expect(
      smokeConfigFor("platform", [{ path: "apps/platform", smoke: custom }]),
    ).toEqual(custom);
  });

  it("matches on the directory name, not the whole path", () => {
    expect(
      smokeConfigFor("docs", [{ path: "sites/docs", smoke: custom }]),
    ).toEqual(custom);
  });

  it("falls back to the table deploy-checks carried while the field is absent", () => {
    expect(smokeConfigFor("platform", [{ path: "apps/platform" }])).toBe(
      FALLBACK_SMOKE.platform,
    );
    expect(smokeConfigFor("schedule-builder", [])).toBe(
      FALLBACK_SMOKE["schedule-builder"],
    );
  });

  it("prefers the field over the fallback", () => {
    expect(
      smokeConfigFor("platform", [{ path: "apps/platform", smoke: custom }])
        ?.hosts.production,
    ).toBe("example.org");
  });

  it("has nothing for an app with neither", () => {
    expect(
      smokeConfigFor("sandbox", [{ path: "apps/sandbox" }]),
    ).toBeUndefined();
  });

  it("refuses a malformed field instead of smoking the stale table", () => {
    expect(() =>
      smokeConfigFor("platform", [
        {
          path: "apps/platform",
          smoke: { ...custom, publicPaths: ["no-slash"] },
        },
      ]),
    ).toThrow(/apps\/platform.*publicPaths/);
  });
});
