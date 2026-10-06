import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appDirFor,
  appWorkspaceRoot,
  DevdogsugaMissingError,
  findApp,
  layoutAt,
  listApps,
  repoKindOf,
  resetLayoutCacheForTests,
  resolveAppPath,
  resolveLayout,
} from "./layout.js";
import { resetRepoRootCacheForTests } from "./root.js";

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../test-fixtures/${name}`, import.meta.url));

const BACKSTAGE = fixture("backstage-repo");
const DEVDOGSUGA_ONLY = fixture("devdogsuga-repo");
const savedRoot = process.env.DEVTOOLS_TEST_REPO_ROOT;

beforeEach(() => {
  resetRepoRootCacheForTests();
  resetLayoutCacheForTests();
});

afterEach(() => {
  if (savedRoot === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = savedRoot;
  resetRepoRootCacheForTests();
  resetLayoutCacheForTests();
});

describe("repoKindOf", () => {
  it("names the repo by its root package.json", () => {
    expect(repoKindOf(BACKSTAGE)).toBe("backstage");
    expect(repoKindOf(DEVDOGSUGA_ONLY)).toBe("devdogsuga");
    expect(repoKindOf(join(BACKSTAGE, "apps"))).toBeNull();
  });
});

describe("layoutAt: a DevDogsUGA checkout", () => {
  const layout = layoutAt(DEVDOGSUGA_ONLY);

  it("is its own DevDogsUGA root, with no Backstage", () => {
    expect(layout.kind).toBe("devdogsuga");
    expect(layout.root).toBe(DEVDOGSUGA_ONLY);
    expect(layout.devdogsugaRoot).toBe(DEVDOGSUGA_ONLY);
    expect(layout.backstageRoot).toBeUndefined();
    expect(layout.envMirrors).toEqual([]);
  });

  it("lists only its own apps, and has no platform", () => {
    expect(listApps(layout).map((app) => app.name)).toEqual([
      "schedule-builder",
    ]);
    expect(findApp("platform", layout)).toBeUndefined();
  });
});

describe("layoutAt: a Backstage checkout", () => {
  const layout = layoutAt(BACKSTAGE);

  it("reaches DevDogsUGA through devdogsuga/", () => {
    expect(layout.kind).toBe("backstage");
    expect(layout.root).toBe(BACKSTAGE);
    expect(layout.backstageRoot).toBe(BACKSTAGE);
    expect(layout.devdogsugaRoot).toBe(join(BACKSTAGE, "devdogsuga"));
    expect(layout.hasDevdogsuga).toBe(true);
  });

  it("mirrors env files into the DevDogsUGA checkout", () => {
    expect(layout.envMirrors).toEqual([join(BACKSTAGE, "devdogsuga")]);
  });

  it("unions both repos' apps, Backstage winning a name clash", () => {
    expect(listApps(layout)).toEqual([
      { name: "platform", dir: join(BACKSTAGE, "apps", "platform") },
      {
        name: "schedule-builder",
        dir: join(BACKSTAGE, "devdogsuga", "apps", "schedule-builder"),
      },
    ]);
  });

  it("finds each app's directory and workspace root", () => {
    expect(findApp("schedule-builder", layout)).toBe(
      join(BACKSTAGE, "devdogsuga", "apps", "schedule-builder"),
    );
    expect(appWorkspaceRoot("platform", layout)).toBe(BACKSTAGE);
    expect(appWorkspaceRoot("schedule-builder", layout)).toBe(
      join(BACKSTAGE, "devdogsuga"),
    );
    expect(appWorkspaceRoot("nothing", layout)).toBe(BACKSTAGE);
  });

  it("resolves a workers.json path to whichever repo has it", () => {
    expect(resolveAppPath("apps/platform", layout)).toBe(
      join(BACKSTAGE, "apps", "platform"),
    );
    expect(resolveAppPath("apps/schedule-builder", layout)).toBe(
      join(BACKSTAGE, "devdogsuga", "apps", "schedule-builder"),
    );
    // Missing everywhere: the first candidate, for an honest ENOENT.
    expect(resolveAppPath("apps/ghost", layout)).toBe(
      join(BACKSTAGE, "apps", "ghost"),
    );
  });
});

describe("a Backstage checkout without devdogsuga/", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "layout-test-"));
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "backstage" }),
    );
    mkdirSync(join(dir, "apps", "platform"), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("only fails when something asks for DevDogsUGA's files", () => {
    const layout = layoutAt(dir);
    expect(layout.hasDevdogsuga).toBe(false);
    expect(layout.envMirrors).toEqual([]);
    expect(listApps(layout).map((app) => app.name)).toEqual(["platform"]);
    expect(() => layout.devdogsugaRoot).toThrow(DevdogsugaMissingError);
    expect(() => layout.devdogsugaRoot).toThrow(/pnpm devdogsuga/);
  });
});

describe("resolveLayout and appDirFor", () => {
  it("follows findRepoRoot()", () => {
    process.env.DEVTOOLS_TEST_REPO_ROOT = BACKSTAGE;
    expect(resolveLayout().kind).toBe("backstage");
    expect(appDirFor("schedule-builder")).toBe(
      join(BACKSTAGE, "devdogsuga", "apps", "schedule-builder"),
    );
  });

  it("takes an explicit root literally", () => {
    process.env.DEVTOOLS_TEST_REPO_ROOT = BACKSTAGE;
    expect(appDirFor("schedule-builder", "/somewhere")).toBe(
      join("/somewhere", "apps", "schedule-builder"),
    );
  });
});
