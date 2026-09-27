import { describe, expect, it } from "vitest";
import { resolveDevtoolsDsn } from "./telemetry.js";

describe("resolveDevtoolsDsn", () => {
  const baked = "https://key@o1.ingest.sentry.io/1";

  it("uses the DSN baked in at build time", () => {
    expect(resolveDevtoolsDsn({}, baked)).toBe(baked);
  });

  it("lets DEVTOOLS_SENTRY_DSN in the environment override it", () => {
    const override = "https://other@o1.ingest.sentry.io/2";
    expect(resolveDevtoolsDsn({ DEVTOOLS_SENTRY_DSN: override }, baked)).toBe(
      override,
    );
  });

  it("is empty when neither is set, so Sentry never initializes", () => {
    expect(resolveDevtoolsDsn({ DEVTOOLS_SENTRY_DSN: "" }, "")).toBe("");
  });
});
