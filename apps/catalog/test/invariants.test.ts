import { describe, expect, it } from "vitest";
import { sectionCountStable } from "~/scrape/invariants";

describe("sectionCountStable", () => {
  it("passes a term's first scrape when it has sections, fails it when empty", () => {
    expect(sectionCountStable(0, 120)).toMatchObject({
      ok: true,
      detail: { baseline: false },
    });
    expect(sectionCountStable(0, 0).ok).toBe(false);
  });

  it("allows a fall of up to 15%", () => {
    expect(sectionCountStable(100, 85)).toMatchObject({
      ok: true,
      detail: { changePercent: -15 },
    });
    expect(sectionCountStable(100, 90).ok).toBe(true);
  });

  it("blocks a fall of more than 15%: a truncated feed", () => {
    expect(sectionCountStable(100, 84).ok).toBe(false);
    expect(sectionCountStable(100, 0).ok).toBe(false);
  });

  it("never blocks growth, however large, and reports it", () => {
    // A Summer term that fills in over a week would otherwise be rolled back
    // every day against the same old count.
    expect(sectionCountStable(100, 116)).toMatchObject({
      ok: true,
      detail: { changePercent: 16 },
    });
    expect(sectionCountStable(100, 400)).toMatchObject({
      ok: true,
      detail: { changePercent: 300 },
    });
  });
});
