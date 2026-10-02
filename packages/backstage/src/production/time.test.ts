import { UsageError } from "@devdogsuga/cli-core/ui";
import { describe, expect, it } from "vitest";
import { dayOf, endOfDay, parseBound, startOfDay } from "./time.js";

describe("Eastern days", () => {
  it("starts a day at Eastern midnight, in and out of daylight time", () => {
    expect(startOfDay("2026-09-30").toISOString()).toBe(
      "2026-09-30T04:00:00.000Z",
    );
    expect(startOfDay("2026-12-01").toISOString()).toBe(
      "2026-12-01T05:00:00.000Z",
    );
  });

  it("ends a day at the next Eastern midnight, across the DST change", () => {
    // 2026-11-01 is the fall-back day: 25 hours long.
    expect(endOfDay("2026-11-01").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });

  it("files an 8pm meeting under its own day, not UTC's", () => {
    expect(dayOf(new Date("2026-09-10T00:00:00Z"))).toBe("2026-09-09");
  });
});

describe("parseBound", () => {
  it("makes --to inclusive of the whole day", () => {
    expect(parseBound("--to", "2026-09-30")?.toISOString()).toBe(
      "2026-10-01T04:00:00.000Z",
    );
  });

  it("takes an exact timestamp as given", () => {
    expect(
      parseBound("--from", "2026-09-30T18:00:00-04:00")?.toISOString(),
    ).toBe("2026-09-30T22:00:00.000Z");
  });

  it("refuses anything else", () => {
    expect(() => parseBound("--from", "Sept 30")).toThrow(UsageError);
  });
});
