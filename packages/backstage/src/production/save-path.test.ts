import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pathSuggestions, resolveSavePath } from "./save-path.js";

let root: string;
let cwd: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "save-path-"));
  mkdirSync(join(root, "exports"));
  writeFileSync(join(root, "attendance.csv"), "");
  writeFileSync(join(root, "attendance-old.csv"), "");
  writeFileSync(join(root, ".env"), "");
  cwd = process.cwd();
  process.chdir(root);
});

afterAll(() => process.chdir(cwd));

const values = (input: string) =>
  pathSuggestions(input, "stars.csv").map((s) => s.value);

describe("pathSuggestions", () => {
  it("keeps what was typed first, then matching entries, folders first", () => {
    expect(values("a")).toEqual(["a", "attendance-old.csv", "attendance.csv"]);
    expect(values("./")).toEqual([
      "./",
      "./exports/",
      "./attendance-old.csv",
      "./attendance.csv",
    ]);
  });

  it("says what Enter would do with the typed path", () => {
    const hint = (input: string) =>
      pathSuggestions(input, "stars.csv")[0]!.hint;
    expect(hint("exports")).toBe("saves exports/stars.csv");
    expect(hint("attendance.csv")).toBe("replaces this file");
    expect(hint("new.csv")).toBe("new file");
    expect(hint("missing/new.csv")).toBe("no such folder");
  });

  it("shows dotfiles only once a dot is typed", () => {
    expect(values(".")).toEqual([".", ".env"]);
  });
});

describe("resolveSavePath", () => {
  it("puts the file inside a chosen folder", () => {
    expect(resolveSavePath("exports/", "stars.csv")).toBe(
      join("exports", "stars.csv"),
    );
    expect(resolveSavePath("x.csv", "stars.csv")).toBe("x.csv");
  });
});
