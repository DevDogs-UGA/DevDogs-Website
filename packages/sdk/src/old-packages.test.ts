import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * brand, env, db, headers and telemetry are subpaths of this package now, and
 * the five old packages are deprecated on npm. Nothing in the repository may
 * import, require or depend on them any more: Checkpoint 3a, "every import
 * uses `@devdogsuga/sdk/*`".
 */
const ROOT = join(import.meta.dirname, "..", "..", "..");
const OLD = "(?:brand|env|db|headers|telemetry)";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".wrangler",
  ".turbo",
  ".dart_tool",
  "build",
  "coverage",
  ".claude",
  ".devtools",
  "workshops",
]);

/** Files that talk ABOUT the old names on purpose. */
const ALLOWED = new Set([
  // Resolution tests build throwaway workspaces with made-up package names.
  "packages/cli-core/src/repo/resolve.test.ts",
  // The docs tree test asserts page titles that happen to be package names.
  "apps/platform/src/lib/docsTree.test.ts",
  // This file.
  "packages/sdk/src/old-packages.test.ts",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Fixtures are repositories of their own.
      if (entry.name === "test-fixtures" || entry.name === "fixture-repo") {
        continue;
      }
      yield* walk(path);
    } else if (/\.(?:[cm]?[jt]sx?|json|vue)$/.test(entry.name)) {
      yield path;
    }
  }
}

const IMPORT = new RegExp(
  String.raw`(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']@devdogsuga/${OLD}(?:/[^"']*)?["']`,
);
const DEPENDENCY = new RegExp(String.raw`^\s*"@devdogsuga/${OLD}"\s*:`, "m");

describe("the old packages", () => {
  it("are recognised in every form an import takes", () => {
    for (const line of [
      'import { x } from "@devdogsuga/env/nextjs";',
      "import x from '@devdogsuga/brand'",
      'const m = await import("@devdogsuga/db/server");',
      'const r = require("@devdogsuga/headers");',
      'import "@devdogsuga/telemetry";',
    ]) {
      expect(IMPORT.test(line), line).toBe(true);
    }
    for (const line of [
      'import { x } from "@devdogsuga/sdk/env";',
      'import { x } from "@devdogsuga/devtools";',
      'const word = "@devdogsuga/environment";',
    ]) {
      expect(IMPORT.test(line), line).toBe(false);
    }
    expect(DEPENDENCY.test('  "@devdogsuga/env": "workspace:*",')).toBe(true);
    expect(DEPENDENCY.test('  "@devdogsuga/sdk": "workspace:*",')).toBe(false);
  });

  const files = [...walk(ROOT)]
    .map((path) => relative(ROOT, path))
    .filter((path) => !ALLOWED.has(path));

  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("are imported nowhere", () => {
    const offenders = files.filter(
      (path) =>
        !path.endsWith("package.json") &&
        IMPORT.test(readFileSync(join(ROOT, path), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("are depended on by no package.json", () => {
    const offenders = files.filter(
      (path) =>
        path.endsWith("package.json") &&
        DEPENDENCY.test(readFileSync(join(ROOT, path), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
