import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Checker {
  importedPackages: (source: string) => Set<string>;
  findUndeclaredImports: (
    distDir: string,
    manifest: Record<string, unknown>,
  ) => Map<string, string[]>;
}

const checker = (await import(
  pathToFileURL(join(ROOT, "scripts", "check-bundle-imports.mjs")).href
)) as Checker;

describe("importedPackages", () => {
  it("finds static, re-exported, dynamic and required packages", () => {
    const found = checker.importedPackages(`
      import a from "alpha";
      import { b } from "@scope/beta/sub";
      import "side-effect";
      export * from "gamma";
      const d = await import("delta/deep");
      const e = require("epsilon");
    `);
    expect([...found].sort()).toEqual([
      "@scope/beta",
      "alpha",
      "delta",
      "epsilon",
      "gamma",
      "side-effect",
    ]);
  });

  it("ignores relative, node: and built-in imports", () => {
    const found = checker.importedPackages(`
      import x from "./local.js";
      import fs from "node:fs";
      import path from "path";
      import p from "fs/promises";
    `);
    expect([...found]).toEqual([]);
  });

  it("does not read strings, templates or comments as imports", () => {
    const found = checker.importedPackages(
      [
        'const s = "see import x from \\"not-a-package\\"";',
        'const t = `from "${name}" in a template`;',
        '// import y from "commented-out";',
      ].join("\n"),
    );
    expect([...found]).toEqual([]);
  });
});

describe("findUndeclaredImports", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("reports an import the manifest does not declare, with its file", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-imports-"));
    writeFileSync(
      join(dir, "launch.js"),
      'import a from "declared";\nimport b from "missing";\n',
    );
    writeFileSync(join(dir, "notes.txt"), 'import c from "ignored";\n');
    const problems = checker.findUndeclaredImports(dir, {
      dependencies: { declared: "1" },
    });
    expect([...problems]).toEqual([["missing", ["launch.js"]]]);
  });

  it("accepts peer and optional dependencies", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-imports-"));
    writeFileSync(
      join(dir, "launch.js"),
      'import a from "peer";\nimport b from "optional";\n',
    );
    const problems = checker.findUndeclaredImports(dir, {
      peerDependencies: { peer: "*" },
      optionalDependencies: { optional: "1" },
    });
    expect(problems.size).toBe(0);
  });

  it("holds for the real build, when there is one", () => {
    const dist = join(ROOT, "dist");
    if (!existsSync(join(dist, "launch.js"))) return;
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect([...checker.findUndeclaredImports(dist, manifest)]).toEqual([]);
  });
});
