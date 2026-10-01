import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  getClient: vi.fn(() => ({})),
  flush: vi.fn(async () => true),
}));
vi.mock("@sentry/node", () => sentry);

import {
  hasRealCaller,
  lastSentryEventId,
  reportDevtoolsError,
  reportDevtoolsFailure,
  resolveDevtoolsDsn,
} from "./telemetry.js";
import { explainError, UsageError } from "./ui.js";

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

describe("hasRealCaller", () => {
  it("reports from a checkout, with or without a terminal", () => {
    expect(hasRealCaller(true, false)).toBe(true);
    expect(hasRealCaller(true, true)).toBe(true);
  });

  it("reports from a terminal outside a checkout, where setup runs", () => {
    expect(hasRealCaller(false, true)).toBe(true);
  });

  it("stays quiet with neither, the shape of a registry scanner", () => {
    expect(hasRealCaller(false, false)).toBe(false);
  });
});

describe("reporting a caught failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captures the error explainError prints", () => {
    const err = new Error("boom");
    explainError("It broke.", err);
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(sentry.flush).not.toHaveBeenCalled();
  });

  it("keeps a UsageError out of Sentry", () => {
    explainError(
      "Nothing called nope.",
      new UsageError("Nothing called nope."),
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("captures a non-zero exit as an error-level message", () => {
    reportDevtoolsFailure("step failed", { exitCode: 2 });
    expect(sentry.captureMessage).toHaveBeenCalledWith("step failed", {
      level: "error",
      extra: { exitCode: 2 },
    });
  });

  it("remembers the event id Sentry returned, for the failure log", () => {
    sentry.captureException.mockReturnValueOnce("abc123");
    reportDevtoolsError(new Error("boom"));
    expect(lastSentryEventId()).toBe("abc123");
  });

  it("does not claim an event id when there is no Sentry client", () => {
    sentry.getClient.mockReturnValueOnce(undefined as never);
    sentry.captureException.mockReturnValueOnce("not-sent");
    reportDevtoolsError(new Error("boom"));
    expect(lastSentryEventId()).not.toBe("not-sent");
  });

  it("reports nothing under DEVTOOLS_TELEMETRY=0", () => {
    vi.stubEnv("DEVTOOLS_TELEMETRY", "0");
    reportDevtoolsError(new Error("boom"));
    reportDevtoolsFailure("step failed");
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
