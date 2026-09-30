import { describe, expect, it } from "vitest";
import { checkpointStep, MAX_ATTEND_STEP } from "../theme/lib/liveProtocol";
import {
  checkAttendRequest,
  checkRate,
  MAX_ATTEND_MESSAGE,
  parseAttendStep,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  tallyAttendees,
} from "./attend";

function upgrade(
  url: string,
  headers: Record<string, string> = {},
  method = "GET",
) {
  return new Request(url, {
    method,
    headers: { Upgrade: "websocket", ...headers },
  });
}

describe("checkAttendRequest", () => {
  const base = "https://slides-relay.devdogsuga.org/attend";

  it("lets a websocket with a track through", () => {
    expect(checkAttendRequest(upgrade(`${base}?track=web`))).toBeUndefined();
    expect(checkAttendRequest(upgrade(`${base}?track=mobile`))).toBeUndefined();
  });

  it("refuses everything else", async () => {
    expect(
      checkAttendRequest(upgrade(`${base}?track=web`, {}, "POST"))?.status,
    ).toBe(405);
    expect(checkAttendRequest(new Request(`${base}?track=web`))?.status).toBe(
      426,
    );
    expect(
      checkAttendRequest(
        upgrade(`${base}?track=web`, { Origin: "https://evil.example" }),
      )?.status,
    ).toBe(403);
    expect(checkAttendRequest(upgrade(base))?.status).toBe(400);
    expect(checkAttendRequest(upgrade(`${base}?track=other`))?.status).toBe(
      400,
    );
  });
});

describe("parseAttendStep", () => {
  it("reads a step", () => {
    expect(parseAttendStep('{"t":"step","step":3}')).toBe(3);
    expect(parseAttendStep('{"t":"step","step":0}')).toBe(0);
    expect(parseAttendStep(`{"t":"step","step":${MAX_ATTEND_STEP}}`)).toBe(
      MAX_ATTEND_STEP,
    );
  });

  it.each([
    ["not JSON", "step 3"],
    ["an array", "[3]"],
    ["null", "null"],
    ["another message type", '{"t":"status","step":3}'],
    ["a fractional step", '{"t":"step","step":2.5}'],
    ["a negative step", '{"t":"step","step":-1}'],
    ["a huge step", `{"t":"step","step":${MAX_ATTEND_STEP + 1}}`],
    ["a string step", '{"t":"step","step":"3"}'],
    ["a missing step", '{"t":"step"}'],
    ["a name riding along", '{"t":"step","step":3,"name":"Ada"}'],
    [
      "a message that is too long",
      `{"t":"step","step":3,"x":"${"a".repeat(MAX_ATTEND_MESSAGE)}"}`,
    ],
  ])("drops %s", (_, raw) => {
    expect(parseAttendStep(raw)).toBeUndefined();
  });

  it("drops binary frames", () => {
    expect(
      parseAttendStep(new TextEncoder().encode('{"t":"step","step":3}').buffer),
    ).toBeUndefined();
  });
});

describe("checkRate", () => {
  it("allows the limit within a window, then refuses", () => {
    let state = {};
    for (let i = 0; i < RATE_LIMIT; i++) {
      const result = checkRate(state, 1000 + i);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    const over = checkRate(state, 1000 + RATE_LIMIT);
    expect(over.ok).toBe(false);
    expect(over.state.count).toBe(RATE_LIMIT + 1);
  });

  it("starts a new window afterwards", () => {
    let state = {};
    for (let i = 0; i <= RATE_LIMIT; i++) state = checkRate(state, 1000).state;
    const later = checkRate(state, 1000 + RATE_WINDOW_MS);
    expect(later.ok).toBe(true);
    expect(later.state).toEqual({
      windowStart: 1000 + RATE_WINDOW_MS,
      count: 1,
    });
  });
});

describe("tallyAttendees", () => {
  it("counts per track and per step", () => {
    const tally = tallyAttendees([
      { track: "web", step: 3 },
      { track: "web", step: 3 },
      { track: "web", step: 1 },
      { track: "web" },
      { track: "mobile", step: 3 },
      {},
    ]);
    expect(tally.web).toEqual({ total: 4, steps: { 3: 2, 1: 1 } });
    expect(tally.mobile).toEqual({ total: 1, steps: { 3: 1 } });
  });

  it("is empty with nobody", () => {
    expect(tallyAttendees([])).toEqual({
      web: { total: 0, steps: {} },
      mobile: { total: 0, steps: {} },
    });
  });
});

describe("checkpointStep", () => {
  it("reads the step number out of a ref", () => {
    expect(checkpointStep("02-supabase/03-insert-naive")).toBe(3);
    expect(checkpointStep("nonsense")).toBeUndefined();
  });
});
