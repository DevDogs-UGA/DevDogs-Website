import { describe, expect, it, vi } from "vitest";
import { calendarEvent, calendarFeed, calendarLinks } from "./calendarEvent";

describe("calendarEvent", () => {
  it("serializes and escapes a portable UTC event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));

    const result = calendarEvent({
      id: "meeting-1",
      title: "Build night, part 1",
      startsAt: new Date("2026-09-09T22:00:00Z"),
      endsAt: new Date("2026-09-10T00:00:00Z"),
      location: "DLW 124; West Campus",
      summary: "Bring a laptop.\nBeginners welcome.",
      rsvpUrl: "https://example.com/rsvp",
      eventUrl: "https://devdogsuga.org/events/build-night",
    });

    expect(result).toContain("UID:meeting-1@devdogsuga.org\r\n");
    expect(result).toContain("DTSTART:20260909T220000Z\r\n");
    expect(result).toContain("DTEND:20260910T000000Z\r\n");
    expect(result).toContain("SUMMARY:Build night\\, part 1\r\n");
    expect(result).toContain("LOCATION:DLW 124\\; West Campus\r\n");
    expect(result).toContain("Bring a laptop.\\nBeginners welcome.");
    expect(result.endsWith("END:VCALENDAR\r\n")).toBe(true);

    vi.useRealTimers();
  });

  it("folds every content line to at most 75 UTF-8 octets", () => {
    const result = calendarEvent({
      id: "meeting-2",
      title: `Workshop: ${"🐶".repeat(40)}`,
      startsAt: new Date("2026-09-09T22:00:00Z"),
      endsAt: new Date("2026-09-10T00:00:00Z"),
      location: null,
      summary: null,
      rsvpUrl: null,
      eventUrl: "https://devdogsuga.org/events/workshop",
    });

    for (const line of result.split("\r\n")) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    }
  });

  it("builds prefilled Google and Outlook composer links", () => {
    const links = calendarLinks({
      title: "Build night",
      startsAt: new Date("2026-09-09T22:00:00Z"),
      endsAt: new Date("2026-09-10T00:00:00Z"),
      location: "DLW 124",
      summary: "Bring a laptop.",
      rsvpUrl: "https://example.com/rsvp",
      eventUrl: "https://devdogsuga.org/events/build-night",
    });

    const google = new URL(links.google);
    expect(google.origin).toBe("https://calendar.google.com");
    expect(google.searchParams.get("text")).toBe("Build night");
    expect(google.searchParams.get("dates")).toBe(
      "20260909T220000Z/20260910T000000Z",
    );
    expect(google.searchParams.get("location")).toBe("DLW 124");

    const outlook = new URL(links.outlook);
    expect(outlook.origin).toBe("https://outlook.live.com");
    expect(outlook.searchParams.get("subject")).toBe("Build night");
    expect(outlook.searchParams.get("startdt")).toBe(
      "2026-09-09T22:00:00.000Z",
    );
    expect(outlook.searchParams.get("body")).toContain(
      "https://example.com/rsvp",
    );
  });

  it("keeps stable UIDs and marks cancelled events in a subscription feed", () => {
    const result = calendarFeed([
      {
        id: "cancelled-meeting",
        title: "Build night",
        startsAt: new Date("2026-09-09T22:00:00Z"),
        endsAt: new Date("2026-09-10T00:00:00Z"),
        location: "DLW 124",
        summary: null,
        rsvpUrl: null,
        eventUrl: "https://devdogsuga.org/events/build-night",
        cancelled: true,
      },
    ]);

    expect(result).toContain("X-WR-CALNAME:DevDogs Events\r\n");
    expect(result).toContain("UID:cancelled-meeting@devdogsuga.org\r\n");
    expect(result).toContain("STATUS:CANCELLED\r\n");
  });
});
