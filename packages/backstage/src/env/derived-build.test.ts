import { beforeAll, describe, expect, it } from "vitest";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";
import { derivedBuildValues } from "./derived-build.js";

beforeAll(async () => {
  await loadRegistry();
  declare({
    source: "derived-build-test",
    server: {
      DB_TEST_REF: define(z.string(), {
        doc: "Never secret input to a derivation.",
        scope: "environment",
        secrecy: "public",
      }),
      DB_TEST_URL: define(z.string(), {
        doc: "Derived and baked into the bundle.",
        scope: "environment",
        secrecy: "public",
        build: true,
        example: "https://$DB_TEST_REF.example.org",
      }),
      DB_TEST_RUNTIME_URL: define(z.string(), {
        doc: "Derived, but only the runtime reads it.",
        scope: "environment",
        secrecy: "public",
        example: "https://$DB_TEST_REF.example.org/rest",
      }),
    },
  });
});

const FORMULA = "https://$DB_TEST_REF.example.org";

describe("derivedBuildValues", () => {
  it("expands a derived build key against the file", () => {
    const { values, unresolved } = derivedBuildValues(
      [
        ["DB_TEST_URL", FORMULA],
        ["DB_TEST_REF", "abc"],
      ],
      ["DB_TEST_URL"],
    );
    expect([...values]).toEqual([["DB_TEST_URL", "https://abc.example.org"]]);
    expect(unresolved).toEqual([]);
  });

  it("resolves a reference that appears later in the file", () => {
    const { values } = derivedBuildValues(
      [
        ["DB_TEST_REF", "abc"],
        ["DB_TEST_URL", FORMULA],
      ],
      ["DB_TEST_URL"],
    );
    expect(values.get("DB_TEST_URL")).toBe("https://abc.example.org");
  });

  it("leaves a derived key that is not build: true to the registry", () => {
    const { values, unresolved } = derivedBuildValues(
      [
        ["DB_TEST_RUNTIME_URL", "https://$DB_TEST_REF.example.org/rest"],
        ["DB_TEST_REF", "abc"],
      ],
      ["DB_TEST_RUNTIME_URL"],
    );
    expect(values.has("DB_TEST_RUNTIME_URL")).toBe(false);
    expect(unresolved).not.toContain("DB_TEST_RUNTIME_URL");
  });

  it("refuses to publish a half-expanded URL when a reference is missing or empty", () => {
    for (const entries of [
      [["DB_TEST_URL", FORMULA]],
      [
        ["DB_TEST_URL", FORMULA],
        ["DB_TEST_REF", ""],
      ],
    ] as [string, string][][]) {
      const { values, unresolved } = derivedBuildValues(entries, [
        "DB_TEST_URL",
      ]);
      expect(values.size).toBe(0);
      expect(unresolved).toEqual(["DB_TEST_URL"]);
    }
  });

  it("only considers keys the push reported as derived", () => {
    const { values } = derivedBuildValues(
      [
        ["DB_TEST_URL", "https://real.example.org"],
        ["DB_TEST_REF", "abc"],
      ],
      [],
    );
    expect(values.size).toBe(0);
  });

  it("expands the manifest's formula for a build key the file leaves out", () => {
    const { values, unresolved } = derivedBuildValues(
      [["DB_TEST_REF", "abc"]],
      [],
    );
    expect(values.get("DB_TEST_URL")).toBe("https://abc.example.org");
    expect(values.has("DB_TEST_RUNTIME_URL")).toBe(false);
    expect(unresolved).not.toContain("DB_TEST_URL");
  });

  it("skips a left-out build key whose reference the file lacks", () => {
    const { values, unresolved } = derivedBuildValues([], []);
    expect(values.has("DB_TEST_URL")).toBe(false);
    expect(unresolved).toContain("DB_TEST_URL");
  });
});
