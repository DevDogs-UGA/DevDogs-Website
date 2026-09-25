import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultLabel } from "./label.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "oauth-label-"));
}

describe("defaultLabel", () => {
  it("prefers package.json's name", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "my-workshop-app" }));
    expect(defaultLabel(dir)).toBe("my-workshop-app");
  });

  it("falls back to the directory name when there is no package.json", () => {
    const dir = tempDir();
    expect(defaultLabel(dir)).toBe(basename(dir));
  });

  it("falls back to the directory name when package.json has no name", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({}));
    expect(defaultLabel(dir)).toBe(basename(dir));
  });

  it("falls back to the directory name when package.json is invalid JSON", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), "{not json");
    expect(defaultLabel(dir)).toBe(basename(dir));
  });
});
