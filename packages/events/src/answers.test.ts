import { describe, expect, it } from "vitest";
import { answerSchema, describeAnswer } from "./answers";
import type { Question } from "./questions";

const learn: Question = {
  id: "how_did_you_learn",
  scope: "meeting",
  prompt: "How did you learn about this event?",
  type: "choice",
  options: [
    { id: "discord", label: "Discord" },
    { id: "flyer", label: "Flyer", retired: true },
  ],
  other: true,
};

const topics: Question = {
  id: "topics",
  scope: "member",
  prompt: "Topics?",
  type: "multiChoice",
  options: [
    { id: "web", label: "Web" },
    { id: "mobile", label: "Mobile" },
  ],
  other: true,
  maxSelected: 2,
};

const ok = (q: Question, a: unknown) => answerSchema(q).safeParse(a).success;

describe("answerSchema", () => {
  it("takes an offered option or Other text, never a retired option", () => {
    expect(ok(learn, { option: "discord" })).toBe(true);
    expect(ok(learn, { other: "Reddit" })).toBe(true);
    expect(ok(learn, { option: "flyer" })).toBe(false);
    expect(ok(learn, { option: "discord", other: "x" })).toBe(false);
    expect(ok({ ...learn, other: false }, { other: "Reddit" })).toBe(false);
  });

  it("counts Other toward a multiChoice's limits", () => {
    expect(ok(topics, { options: ["web"], other: "AI" })).toBe(true);
    expect(ok(topics, { options: ["web", "mobile"], other: "AI" })).toBe(false);
    expect(ok(topics, { options: [] })).toBe(false);
    expect(ok(topics, { options: ["web", "web"] })).toBe(false);
  });

  it("holds text to its length and a scale to its range", () => {
    const text: Question = {
      id: "t",
      scope: "meeting",
      prompt: "p",
      type: "text",
      maxLength: 5,
    };
    expect(ok(text, { text: "hello" })).toBe(true);
    expect(ok(text, { text: "hello!" })).toBe(false);
    expect(ok(text, { text: "   " })).toBe(false);
    const scale: Question = {
      id: "s",
      scope: "meeting",
      prompt: "p",
      type: "scale",
      min: 1,
      max: 5,
    };
    expect(ok(scale, { value: 5 })).toBe(true);
    expect(ok(scale, { value: 6 })).toBe(false);
    expect(ok(scale, { value: 2.5 })).toBe(false);
  });
});

describe("describeAnswer", () => {
  it("writes labels, keeps retired ones, and joins several", () => {
    expect(describeAnswer(learn, { option: "flyer" })).toBe("Flyer");
    expect(describeAnswer(learn, { other: "Reddit" })).toBe("Reddit");
    expect(
      describeAnswer(topics, { options: ["web", "mobile"], other: "AI" }),
    ).toBe("Web; Mobile; AI");
  });
});
