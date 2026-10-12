import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scrubText } from "./scrub.js";

/**
 * The cases the Dart SDK's `scrub_test.dart` also runs. They live in the spec
 * package so the two languages are held to one list.
 */
const file = new URL(
  "../../../sdk-spec/telemetry/scrub-cases.json",
  import.meta.url,
);
const { cases } = JSON.parse(readFileSync(file, "utf8")) as {
  cases: { name: string; input: string; expected: string }[];
};

describe("shared scrub cases", () => {
  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(3);
  });

  it.each(cases)("$name", ({ input, expected }) => {
    expect(scrubText(input)).toBe(expected);
  });
});
