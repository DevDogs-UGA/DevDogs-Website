import { describe, expect, it } from "vitest";
import {
  afterReview,
  attendUrl,
  backoffDelay,
  decideCheckpoint,
  defer,
  offerText,
  parseRelayMessage,
  prune,
  queue,
  reportableStep,
  stepMessage,
  trackOfRepo,
  type Step,
} from "./index.js";

const step = (workshop: string, number: number, slug = `s${number}`): Step => ({
  tag: `${workshop}/${String(number).padStart(2, "0")}-${slug}`,
  workshop,
  number,
  slug,
  title: `Title ${number}`,
  run: [],
  docs: undefined,
  commit: "0".repeat(40),
  start: undefined,
});

const LINE = [
  step("01-intro", 0, "start"),
  step("01-intro", 1),
  step("02-supabase", 0, "start"),
  step("02-supabase", 1),
  step("02-supabase", 2),
  step("02-supabase", 3),
];
const [, intro1, , s1, s2, s3] = LINE as [Step, Step, Step, Step, Step, Step];

describe("trackOfRepo", () => {
  it("maps the two workshop repos", () => {
    expect(trackOfRepo("DevDogsUGA/Web-Workshops")).toBe("web");
    expect(trackOfRepo("devdogsuga/mobile-workshops")).toBe("mobile");
    expect(trackOfRepo("DevDogsUGA/Other")).toBeUndefined();
  });
});

describe("attendUrl", () => {
  it("adds the track", () => {
    expect(attendUrl("wss://slides-relay.devdogsuga.org/attend", "web")).toBe(
      "wss://slides-relay.devdogsuga.org/attend?track=web",
    );
    expect(attendUrl("ws://127.0.0.1:1234/attend?track=x", "mobile")).toBe(
      "ws://127.0.0.1:1234/attend?track=mobile",
    );
  });
  it("refuses other schemes and junk", () => {
    expect(attendUrl("https://example.com/attend", "web")).toBeUndefined();
    expect(attendUrl("not a url", "web")).toBeUndefined();
  });
});

describe("parseRelayMessage", () => {
  const checkpoint = (over: object = {}) =>
    JSON.stringify({
      t: "checkpoint",
      id: "abc",
      ref: "02-supabase/03-insert-naive",
      tracks: ["web"],
      ...over,
    });

  it("reads live", () => {
    expect(parseRelayMessage('{"t":"live","live":true}', "web")).toEqual({
      kind: "live",
      live: true,
    });
    expect(parseRelayMessage('{"t":"live","live":false}', "web")).toEqual({
      kind: "live",
      live: false,
    });
  });
  it("reads a checkpoint for its track", () => {
    expect(parseRelayMessage(checkpoint(), "web")).toEqual({
      kind: "checkpoint",
      id: "abc",
      ref: "02-supabase/03-insert-naive",
    });
    expect(
      parseRelayMessage(checkpoint({ tracks: ["web", "mobile"] }), "mobile"),
    ).toMatchObject({ kind: "checkpoint" });
  });
  it("ignores a checkpoint for another track", () => {
    expect(parseRelayMessage(checkpoint(), "mobile")).toBeUndefined();
    expect(
      parseRelayMessage(checkpoint({ tracks: "web" }), "web"),
    ).toBeUndefined();
  });
  it("ignores bad refs and everything else", () => {
    expect(
      parseRelayMessage(checkpoint({ ref: "main; rm -rf" }), "web"),
    ).toBeUndefined();
    expect(
      parseRelayMessage(checkpoint({ ref: "../x/01-y" }), "web"),
    ).toBeUndefined();
    expect(parseRelayMessage(checkpoint({ ref: 3 }), "web")).toBeUndefined();
    expect(
      parseRelayMessage('{"t":"live","live":"yes"}', "web"),
    ).toBeUndefined();
    expect(
      parseRelayMessage('{"t":"state","state":{}}', "web"),
    ).toBeUndefined();
    expect(parseRelayMessage("nope", "web")).toBeUndefined();
    expect(parseRelayMessage("null", "web")).toBeUndefined();
    expect(parseRelayMessage("3", "web")).toBeUndefined();
  });
});

describe("stepMessage", () => {
  it("is the one message we send", () => {
    expect(JSON.parse(stepMessage(3))).toEqual({ t: "step", step: 3 });
  });
});

describe("reportableStep", () => {
  it("is the current step's number in the newest workshop", () => {
    expect(reportableStep(LINE, s2)).toBe(2);
    expect(reportableStep(LINE, s1)).toBe(1);
  });
  it("is 0 before starting, at a start marker, or in an older workshop", () => {
    expect(reportableStep(LINE, null)).toBe(0);
    expect(reportableStep(LINE, LINE[2]!)).toBe(0);
    expect(reportableStep(LINE, intro1)).toBe(0);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially up to the cap", () => {
    const top = () => 1;
    const low = () => 0;
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, top))).toEqual([
      1000, 2000, 4000, 8000,
    ]);
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, low))).toEqual([
      500, 1000, 2000, 4000,
    ]);
    expect(backoffDelay(10, top)).toBe(60_000);
    expect(backoffDelay(1000, top)).toBe(60_000);
  });
  it("jitters within [ceiling/2, ceiling]", () => {
    for (let i = 0; i < 200; i++) {
      const d = backoffDelay(3);
      expect(d).toBeGreaterThanOrEqual(4000);
      expect(d).toBeLessThanOrEqual(8000);
    }
  });
});

describe("decideCheckpoint", () => {
  const base = { line: LINE, reviewing: false };
  it("offers a step they don't have", () => {
    expect(decideCheckpoint({ ...base, ref: s3.tag, current: s1 })).toBe(
      "offer",
    );
    expect(decideCheckpoint({ ...base, ref: s1.tag, current: null })).toBe(
      "offer",
    );
  });
  it("does nothing when they have it or more", () => {
    expect(decideCheckpoint({ ...base, ref: s2.tag, current: s2 })).toBe(
      "have",
    );
    expect(decideCheckpoint({ ...base, ref: s1.tag, current: s3 })).toBe(
      "have",
    );
  });
  it("queues during a review", () => {
    expect(
      decideCheckpoint({ ...base, ref: s3.tag, current: s1, reviewing: true }),
    ).toBe("queue");
  });
  it("still ignores what they have during a review", () => {
    expect(
      decideCheckpoint({ ...base, ref: s1.tag, current: s2, reviewing: true }),
    ).toBe("have");
  });
  it("ignores tags this clone doesn't have or that aren't steps", () => {
    expect(
      decideCheckpoint({ ...base, ref: "02-supabase/09-later", current: s1 }),
    ).toBe("ignore");
    expect(
      decideCheckpoint({ ...base, ref: LINE[2]!.tag, current: null }),
    ).toBe("ignore");
  });
  it("compares by line position across workshops", () => {
    expect(decideCheckpoint({ ...base, ref: s1.tag, current: intro1 })).toBe(
      "offer",
    );
    expect(decideCheckpoint({ ...base, ref: intro1.tag, current: s1 })).toBe(
      "have",
    );
  });
});

describe("offer state", () => {
  it("keeps the newest deferred step as the badge", () => {
    let state = defer({}, s2.tag, LINE);
    state = defer(state, s1.tag, LINE);
    expect(state.badge).toBe(s2.tag);
    state = defer(state, s3.tag, LINE);
    expect(state.badge).toBe(s3.tag);
  });

  it("prunes what they've caught up to", () => {
    const state = { badge: s2.tag, queued: s3.tag };
    expect(prune(state, LINE, s1)).toEqual(state);
    expect(prune(state, LINE, s2)).toEqual({ queued: s3.tag });
    expect(prune(state, LINE, s3)).toEqual({});
    expect(prune({ badge: "gone/01-x" }, LINE, null)).toEqual({});
  });

  it("offers a queued step when the review finishes", () => {
    const state = queue({}, s2.tag, LINE);
    expect(afterReview(state, true, LINE)).toEqual({
      state: {},
      offer: s2.tag,
    });
  });

  it("badges a queued step when the review is cancelled", () => {
    const state = queue({ badge: s1.tag }, s3.tag, LINE);
    expect(afterReview(state, false, LINE)).toEqual({
      state: { badge: s3.tag },
      offer: undefined,
    });
  });

  it("does nothing without a queued step", () => {
    const state = { badge: s1.tag };
    expect(afterReview(state, true, LINE)).toEqual({ state, offer: undefined });
  });

  it("words the offer", () => {
    expect(offerText(s3)).toBe("Presenter finished Step 3: Title 3");
    expect(offerText({ ...s3, title: "" })).toBe(
      "Presenter finished Step 3: s3",
    );
  });
});
