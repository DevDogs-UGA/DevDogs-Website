import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRelative, resolveInside } from "./paths.js";

const root = resolve("/tmp/clone");

describe("resolveInside", () => {
  it("resolves ordinary relative paths", () => {
    expect(resolveInside(root, "app/page.tsx")).toBe(resolve(root, "app/page.tsx"));
    expect(resolveInside(root, "./a/../b.ts")).toBe(resolve(root, "b.ts"));
    expect(resolveInside(root, "app/(group)/[id]/page.tsx")).toBe(resolve(root, "app/(group)/[id]/page.tsx"));
  });

  it("refuses anything that leaves the clone", () => {
    for (const bad of [
      "../x",
      "a/../../x",
      "..",
      "/etc/passwd",
      "C:\\Windows\\win.ini",
      "..\\..\\x",
      "\\\\server\\share",
      "a\0b",
      "",
      ".",
    ]) {
      expect(resolveInside(root, bad), bad).toBeNull();
    }
  });

  it("refuses .git internals", () => {
    expect(resolveInside(root, ".git/config")).toBeNull();
    expect(resolveInside(root, ".gitignore")).not.toBeNull();
  });
});

describe("repoRelative", () => {
  it("normalises to forward slashes", () => {
    expect(repoRelative(root, "./a/b/../c.ts")).toBe("a/c.ts");
    expect(repoRelative(root, "../c.ts")).toBeNull();
  });
});
