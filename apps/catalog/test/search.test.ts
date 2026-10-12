import { describe, expect, it } from "vitest";
import { codePrefix, prefixTsQuery } from "~/api/queries";

describe("prefixTsQuery", () => {
  it("makes every plain word a prefix", () => {
    expect(prefixTsQuery("intro")).toBe("intro:*");
    expect(prefixTsQuery("Intro  Prog")).toBe("intro:* & prog:*");
    expect(prefixTsQuery("csci 1301")).toBe("csci:* & 1301:*");
  });

  it("leaves the web-search syntax to websearch_to_tsquery", () => {
    for (const q of [
      '"intro to"',
      "calculus -programming",
      "a:b",
      "x | y",
      "it's",
    ]) {
      expect(prefixTsQuery(q), q).toBeNull();
    }
  });

  it("drops the word or, and caps the words at eight", () => {
    expect(prefixTsQuery("intro or programming")).toBe(
      "intro:* & programming:*",
    );
    const nine = "a b c d e f g h i";
    expect(prefixTsQuery(nine)?.split(" & ")).toHaveLength(8);
  });

  it("is null for nothing but spaces", () => {
    expect(prefixTsQuery("   ")).toBeNull();
  });
});

describe("codePrefix", () => {
  it("reads a course code in any spelling", () => {
    expect(codePrefix("csci 1301")).toBe("CSCI1301");
    expect(codePrefix("CSCI-1301")).toBe("CSCI1301");
    expect(codePrefix("csci13")).toBe("CSCI13");
  });

  it("is null for words and for numbers alone", () => {
    expect(codePrefix("intro to programming")).toBeNull();
    expect(codePrefix("1301")).toBeNull();
  });
});
