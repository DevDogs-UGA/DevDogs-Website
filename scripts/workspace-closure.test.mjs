import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { closure, workspacePackages } from "./workspace-closure.mjs";

function repo(packages) {
  const root = mkdtempSync(join(tmpdir(), "closure-"));
  for (const [dir, json] of Object.entries(packages)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify(json));
  }
  return root;
}

test("follows workspace dependencies transitively and ignores the rest", () => {
  const root = repo({
    "packages/a": { name: "a", dependencies: { b: "workspace:*", zod: "^3" } },
    "packages/b": { name: "b", devDependencies: { c: "workspace:^" } },
    "packages/c": { name: "c" },
    "packages/d": { name: "d", dependencies: { a: "workspace:*" } },
  });
  assert.deepEqual(closure(workspacePackages(root), ["a"]), [
    "packages/a",
    "packages/b",
    "packages/c",
  ]);
});

test("a name that is not in the workspace is an error", () => {
  const root = repo({ "packages/a": { name: "a" } });
  assert.throws(() => closure(workspacePackages(root), ["nope"]), /nope/);
});

test("this repository: devtools needs sdk and config", () => {
  const root = new URL("..", import.meta.url).pathname;
  const dirs = closure(workspacePackages(root), [
    "@devdogsuga/devtools",
    "@devdogsuga/cli-core",
  ]);
  for (const dir of ["packages/sdk", "packages/config", "packages/cli-core"]) {
    assert.ok(dirs.includes(dir), dir);
  }
});
