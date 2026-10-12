import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkWorkers,
  deployMatrixApps,
  deployWorkerCalls,
  workspaceGlobs,
} from "./workers.js";

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

describe("deployMatrixApps with entry keys", () => {
  it("reads past the dir and release keys under each entry, and stops at the next key of the job", () => {
    const text = [
      "jobs:",
      "  staging-deploy:",
      "    strategy:",
      "      matrix:",
      "        include:",
      "          - app: platform",
      "            dir: apps/platform",
      "            release: ${{ github.sha }}",
      "          # a comment between entries",
      "          - app: catalog",
      "            dir: apps/catalog",
      "    steps:",
      "      - app: not-an-entry",
    ].join("\n");
    expect(deployMatrixApps(text)).toEqual([["platform", "catalog"]]);
  });
});

const CALL = (name: string, tier: string, dir: string) =>
  [
    `  ${name}:`,
    "    needs: [resolve]",
    "    uses: ./.github/workflows/deploy-worker.yaml",
    "    secrets: inherit",
    "    with:",
    `      environment: ${tier}`,
    `      tier: ${tier}`,
    `      worker_dir: ${dir}`,
    `      worker_name: ${tier}-${dir.split("/").pop()}`,
  ].join("\n");

describe("deployWorkerCalls", () => {
  it("reads each shared-workflow call's tier and directory, and ignores other jobs", () => {
    const text = [
      "jobs:",
      "  resolve:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: backstage deploy platform --tier production",
      CALL("staging-platform", "staging", "apps/platform"),
      CALL("staging-catalog", "staging", "apps/catalog"),
      CALL("production-platform", "production", "apps/platform"),
    ].join("\n");
    expect(deployWorkerCalls(text)).toEqual({
      staging: ["platform", "catalog"],
      production: ["platform"],
    });
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

  it("leaves a hand-deployed app out of workers.json without complaint", () => {
    repo(["platform", "schedule-builder"]);
    write("apps/slides/package.json", '{"name":"slides"}');
    write("apps/slides/wrangler.jsonc", "{}");
    expect(checkWorkers(root)).toEqual([]);
  });

  it("flags a package name that disagrees with its directory", () => {
    repo(["platform", "schedule-builder"]);
    write("apps/platform/package.json", '{"name":"web"}');
    expect(checkWorkers(root).join("\n")).toContain('named "web"');
  });

  function deployWorkflow(staging: string[], production: string[]): void {
    write(
      ".github/workflows/deploy.yaml",
      [
        "jobs:",
        ...staging.map((app) =>
          CALL(`staging-${app}`, "staging", `apps/${app}`),
        ),
        ...production.map((app) =>
          CALL(`production-${app}`, "production", `apps/${app}`),
        ),
      ].join("\n"),
    );
  }

  it("passes when deploy.yaml deploys every Worker to staging and production", () => {
    repo(["platform", "schedule-builder"]);
    deployWorkflow(
      ["platform", "schedule-builder"],
      ["platform", "schedule-builder"],
    );
    expect(checkWorkers(root)).toEqual([]);
  });

  it("flags a Worker in workers.json that deploy.yaml does not deploy to staging", () => {
    repo(["platform", "schedule-builder"]);
    deployWorkflow(["platform"], ["platform", "schedule-builder"]);
    expect(checkWorkers(root)).toEqual([
      "deploy.yaml deploys [platform] to staging; workers.json lists [platform, schedule-builder].",
    ]);
  });

  it("flags a Worker that deploy.yaml does not deploy to production", () => {
    repo(["platform", "schedule-builder"]);
    deployWorkflow(["platform", "schedule-builder"], ["platform"]);
    expect(checkWorkers(root)).toEqual([
      "deploy.yaml deploys [platform] to production; workers.json lists [platform, schedule-builder].",
    ]);
  });

  it("flags a deploy.yaml with no Worker deploy at all", () => {
    repo(["platform", "schedule-builder"]);
    write(
      ".github/workflows/deploy.yaml",
      "jobs:\n  resolve:\n    steps: []\n",
    );
    expect(checkWorkers(root)).toEqual([
      "deploy.yaml has no staging Worker deploy.",
    ]);
  });

  it("flags a deploy matrix that drifted", () => {
    repo(["platform", "ghost"]);
    expect(checkWorkers(root).join("\n")).toContain("deploy-app.yaml's matrix");
  });
});

describe("checkWorkers by layout", () => {
  const fixture = (name: string): string =>
    fileURLToPath(
      new URL(`../../../cli-core/test-fixtures/${name}`, import.meta.url),
    );

  it("has nothing to check in a DevDogsUGA without workers.json", () => {
    expect(checkWorkers(fixture("devdogsuga-repo"))).toEqual([]);
  });

  it("finds schedule-builder in devdogsuga/ from a Backstage checkout", () => {
    // No deploy-app.yaml in the fixture: Backstage's deploy workflow is its
    // own, so that alone is not drift there.
    expect(checkWorkers(fixture("backstage-repo"))).toEqual([]);
  });
});
