import { describe, expect, it } from "vitest";
import { representativePart } from "~/api/queries";

const part = (code: string, classesBegin: string, classesEnd: string) => ({
  code,
  description: code,
  classesBegin,
  dropAddEnds: classesBegin,
  censusDate: classesBegin,
  withdrawalDeadline: classesEnd,
  classesEnd,
  finalsEnd: null,
});

describe("representativePart", () => {
  it("is the Full Term even when another part is longer", () => {
    const parts = [
      part("VM", "2027-01-04", "2027-05-07"),
      part("1", "2027-01-11", "2027-05-04"),
      part("S1", "2027-01-11", "2027-03-02"),
    ];
    expect(representativePart(parts)?.code).toBe("1");
  });

  it("falls back to the longest part, the first code winning a tie", () => {
    const parts = [
      part("S2", "2027-03-03", "2027-04-28"),
      part("B", "2027-01-04", "2027-05-07"),
      part("A", "2027-01-04", "2027-05-07"),
    ];
    expect(representativePart(parts)?.code).toBe("A");
  });

  it("is null for a term with no parts", () => {
    expect(representativePart([])).toBeNull();
  });
});
