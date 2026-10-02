import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkWorkers, deployMatrixApps, workspaceGlobs } from "./workers.js";

const MATRIX = (apps: string[]) =>
  [
    "jobs:",
    "  deploy:",
    "    strategy:",
    "      matrix:",
    "        include:",
    ...apps.flatMap((app) => [
      `          - app: ${app}`,
      "            mint: false",
    ]),
    "    steps: []",
  ].join("\n");

describe("workspaceGlobs", () => {
  it("reads the packages list and stops at the next key", () => {
    expect(
      workspaceGlobs(
        'packages:\n  - "apps/*"\n  - packages/*\n  - docs\nother: 1\n',
      ),
    ).toEqual(["apps/*", "packages/*", "docs"]);
  });
});

describe("deployMatrixApps", () => {
  it("reads the include block's apps", () => {
    expect(deployMatrixApps(MATRIX(["platform", "schedule-builder"]))).toEqual([
      ["platform", "schedule-builder"],
    ]);
  });
});

describe("checkWorkers", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function write(path: string, text: string): void {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  function repo(matrix: string[]): void {
    root = mkdtempSync(join(tmpdir(), "check-workers-"));
    write("pnpm-workspace.yaml", "packages:\n  - apps/*\n");
    write(
      "workers.json",
      JSON.stringify(["apps/platform", "apps/schedule-builder"]),
    );
    write("apps/platform/package.json", '{"name":"platform"}');
    write("apps/platform/wrangler.jsonc", "{}");
    write("apps/schedule-builder/package.json", '{"name":"schedule-builder"}');
    write("apps/schedule-builder/wrangler.jsonc", "{}");
    write(".github/workflows/deploy-app.yaml", MATRIX(matrix));
  }

  it("passes when everything agrees", () => {
    repo(["platform", "schedule-builder"]);
    expect(checkWorkers(root)).toEqual([]);
  });

  it("flags a wrangler config workers.json does not list", () => {
    repo(["platform", "schedule-builder"]);
    write("apps/new/package.json", '{"name":"new"}');
    write("apps/new/wrangler.jsonc", "{}");
    expect(checkWorkers(root)).toEqual([
      "apps/new has a wrangler.jsonc but is not in workers.json.",
    ]);
  });

  it("flags a package name that disagrees with its directory", () => {
    repo(["platform", "schedule-builder"]);
    write("apps/platform/package.json", '{"name":"web"}');
    expect(checkWorkers(root).join("\n")).toContain('named "web"');
  });

  it("flags a deploy matrix that drifted", () => {
    repo(["platform", "ghost"]);
    expect(checkWorkers(root).join("\n")).toContain("deploy-app.yaml's matrix");
  });
});
