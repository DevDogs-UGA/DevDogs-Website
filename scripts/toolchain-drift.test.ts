import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareToolchains,
  diffFiles,
  parseMapBlock,
  type ToolchainInput,
} from "./toolchain-drift.ts";

const workspace = (parts: {
  catalog?: string[];
  overrides?: string[];
  patched?: string[];
}) =>
  [
    "packages:",
    '  - "apps/*"',
    "",
    "overrides:",
    ...(parts.overrides ?? []).map((l) => `  ${l}`),
    "catalog:",
    ...(parts.catalog ?? []).map((l) => `  ${l}`),
    "patchedDependencies:",
    ...(parts.patched ?? []).map((l) => `  ${l}`),
    "other: true",
  ].join("\n");

const input = (
  parts: Parameters<typeof workspace>[0],
  patchFiles: Record<string, string> = {},
): ToolchainInput => ({ workspace: workspace(parts), patchFiles });

describe("parseMapBlock", () => {
  it("reads bare, quoted and commented entries and stops at the next key", () => {
    const yaml = [
      "catalog:",
      "  # a comment",
      "  react: ^19.2.8 # trailing",
      '  "@clack/prompts": 1.7.0',
      "  '@types/node': ^26.2.0",
      "",
      "  zod: 4.4.3",
      "next: 1",
    ].join("\n");
    assert.deepEqual(parseMapBlock(yaml, "catalog"), {
      react: "^19.2.8",
      "@clack/prompts": "1.7.0",
      "@types/node": "^26.2.0",
      zod: "4.4.3",
    });
    assert.deepEqual(parseMapBlock(yaml, "overrides"), {});
  });
});

describe("compareToolchains", () => {
  it("passes identical toolchains and lists one-sided entries as info", () => {
    const report = compareToolchains(
      input({ catalog: ["react: ^19", "zod: 4.4.3"] }),
      input({ catalog: ["react: ^19", "papaparse: ^5"] }),
    );
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.info, [
      "catalog: zod is only in Backstage",
      "catalog: papaparse is only in DevDogsUGA",
    ]);
  });

  it("fails on a shared catalog entry with different specifiers", () => {
    const report = compareToolchains(
      input({ catalog: ["react: ^19.2.8"] }),
      input({ catalog: ["react: ^19.3.0"] }),
    );
    assert.deepEqual(report.errors, [
      "catalog: react is ^19.2.8 in Backstage but ^19.3.0 in DevDogsUGA",
    ]);
  });

  it("fails on shared overrides that differ but not on one-sided ones", () => {
    const report = compareToolchains(
      input({ overrides: ["undici: ^7.29.1", "fflate: ~0.7.5"] }),
      input({ overrides: ["undici: ^7.30.0"] }),
    );
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0] ?? "", /overrides: undici/);
    assert.deepEqual(report.info, ["overrides: fflate is only in Backstage"]);
  });

  it("fails on any patchedDependencies difference", () => {
    const report = compareToolchains(
      input({
        patched: ["a@1.0.0: patches/a.patch", "b@1.0.0: patches/b.patch"],
      }),
      input({
        patched: ["a@1.0.0: patches/other.patch", "c@1.0.0: patches/c.patch"],
      }),
    );
    const text = report.errors.join("\n");
    assert.equal(report.errors.length, 3);
    assert.match(text, /a@1\.0\.0 points at patches\/a\.patch/);
    assert.match(text, /b@1\.0\.0 is patched in Backstage only/);
    assert.match(text, /c@1\.0\.0 is patched in DevDogsUGA only/);
  });

  it("fails when patches/ files or patches.json differ", () => {
    const report = compareToolchains(
      input({}, { "a.patch": "1", "patches.json": "x", "mine.patch": "1" }),
      input({}, { "a.patch": "2", "patches.json": "x", "theirs.patch": "1" }),
    );
    assert.deepEqual(report.errors, [
      "patches/a.patch has different contents in Backstage and DevDogsUGA",
      "patches/mine.patch exists only in Backstage",
      "patches/theirs.patch exists only in DevDogsUGA",
    ]);
  });
});

describe("diffFiles", () => {
  it("reports nothing for equal maps", () => {
    assert.deepEqual(diffFiles({ a: "1" }, { a: "1" }), {
      changed: [],
      onlyOurs: [],
      onlyTheirs: [],
    });
  });
});
