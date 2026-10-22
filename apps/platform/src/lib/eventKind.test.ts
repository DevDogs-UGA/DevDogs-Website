import { describe, expect, it } from "vitest";
import { categoryOf } from "./eventKind";

describe("categoryOf (D12)", () => {
  it.each([
    ["Build Session", "build"],
    ["Study Session", "study"],
    ["Interest Meeting", "info"],
    ["Social", "social"],
    ["Demo Night", "milestone"],
  ] as const)("maps %s to %s", (kind, category) => {
    expect(categoryOf({ kind })).toBe(category);
  });

  it("falls back to build for a one-off with no kind", () => {
    expect(categoryOf({ kind: null })).toBe("build");
    expect(categoryOf({ kind: null, segments: ["open"] })).toBe("build");
  });

  it("falls back to build for an unknown kind", () => {
    expect(categoryOf({ kind: "Hack Night" })).toBe("build");
  });

  it("lets a workshop segment win over the authored kind", () => {
    expect(categoryOf({ kind: "Social", segments: ["workshop"] })).toBe(
      "workshop",
    );
    expect(categoryOf({ kind: null, workshops: [{}] })).toBe("workshop");
  });

  it("does not inherit from Object.prototype", () => {
    expect(categoryOf({ kind: "constructor" })).toBe("build");
  });
});
