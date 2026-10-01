import { describe, expect, it } from "vitest";
import { hasYes, isCiEnv, isNonInteractive, stripNoEnvFlag } from "./mode.js";

describe("isNonInteractive", () => {
  it("is true without a TTY", () => {
    expect(isNonInteractive({}, false)).toBe(true);
  });

  it("is true under CI=true even with a TTY", () => {
    expect(isNonInteractive({ CI: "true" }, true)).toBe(true);
  });

  it("is false on a terminal outside CI", () => {
    expect(isNonInteractive({}, true)).toBe(false);
    expect(isNonInteractive({ CI: "false" }, true)).toBe(false);
  });
});

describe("isCiEnv", () => {
  it("accepts true and 1 only", () => {
    expect(isCiEnv({ CI: "true" })).toBe(true);
    expect(isCiEnv({ CI: "1" })).toBe(true);
    expect(isCiEnv({ CI: "" })).toBe(false);
    expect(isCiEnv({})).toBe(false);
  });
});

describe("hasYes", () => {
  it("finds --yes anywhere", () => {
    expect(hasYes(["supabase", "db", "push", "--yes"])).toBe(true);
    expect(hasYes(["supabase", "db", "push"])).toBe(false);
  });
});

describe("stripNoEnvFlag", () => {
  it("removes the flag wherever it sits and keeps the rest in order", () => {
    expect(stripNoEnvFlag(["--no-env", "check", "env"])).toEqual({
      noEnv: true,
      rest: ["check", "env"],
    });
    expect(stripNoEnvFlag(["check", "env"])).toEqual({
      noEnv: false,
      rest: ["check", "env"],
    });
  });
});
