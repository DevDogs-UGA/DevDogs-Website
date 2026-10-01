import { describe, expect, it } from "vitest";
import { checkScriptVocabulary, isAllowedScript } from "./scripts.js";

describe("isAllowedScript", () => {
  it.each([
    "dev",
    "build",
    "start",
    "preview",
    "typecheck",
    "lint",
    "lint:fix",
    "format:check",
    "format:write",
    "test",
    "test:watch",
    "test:rls",
    "check:links",
    "codegen",
    "types:db",
    "types:db:check",
    "fetch:campus-map",
    "populate:search",
    "prebuild",
    "pretypecheck",
    "prepare",
  ])("allows %s", (name) => {
    expect(isAllowedScript(name)).toBe(true);
  });

  it.each([
    "cf:preview",
    "cf:build:staging",
    "test:coverage",
    "generate-types",
    "_images",
    "types",
    "populate",
    "devtools",
  ])("refuses %s", (name) => {
    expect(isAllowedScript(name)).toBe(false);
  });

  it("allows the CLI runners only at the root", () => {
    expect(isAllowedScript("devtools", true)).toBe(true);
    expect(isAllowedScript("backstage", true)).toBe(true);
  });
});

describe("checkScriptVocabulary", () => {
  it("passes a conforming package", () => {
    expect(
      checkScriptVocabulary([
        {
          dir: "apps/platform",
          scripts: {
            build: "x",
            lint: "x",
            "lint:fix": "x",
            test: "vitest run",
            "test:watch": "vitest",
          },
        },
      ]),
    ).toEqual([]);
  });

  it("names the package and the script, with a replacement for a banned one", () => {
    const problems = checkScriptVocabulary([
      {
        dir: "apps/platform",
        scripts: { "cf:preview": "x", "test:coverage": "x" },
      },
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("apps/platform");
    expect(problems[0]).toContain("use `preview`");
    expect(problems[1]).toContain("test:coverage");
  });

  it("wants lint:fix beside lint, and test:watch beside a Vitest test", () => {
    const problems = checkScriptVocabulary([
      { dir: "packages/a", scripts: { lint: "x", test: "vitest run" } },
    ]);
    expect(problems).toEqual([
      'packages/a: has "lint" but no "lint:fix".',
      'packages/a: runs Vitest in "test" but has no "test:watch".',
    ]);
  });
});
