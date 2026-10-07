import { describe, expect, it } from "vitest";
import { timeRange } from "./date-format.js";

describe("newsletter time ranges", () => {
  it("prints minutes and shares the PM suffix for an evening meeting", () => {
    expect(
      timeRange(
        new Date("2026-10-08T19:00:00-04:00"),
        new Date("2026-10-08T19:30:00-04:00"),
      ),
    ).toBe("7:00–7:30 PM");
  });
  it("keeps both meridiems when a range crosses noon", () => {
    expect(
      timeRange(
        new Date("2026-10-08T11:00:00-04:00"),
        new Date("2026-10-08T13:30:00-04:00"),
      ),
    ).toBe("11:00 AM–1:30 PM");
  });
});
