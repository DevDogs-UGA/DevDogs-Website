import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `commands.ts` orchestrates resolved ids and a handful of `gh` calls;
 * every one of those is mocked here so this suite is about ORCHESTRATION —
 * what happens when Renovate's App id cannot be resolved, and what happens
 * when a REQUIRED id (devops/admins/the platform App) cannot be — not about
 * what `gh` itself returns. `desired.test.ts` and `diff.test.ts` cover the
 * pure shape and the diff; `api.test.ts`/`actors.test.ts` cover the `gh`
 * invocations themselves.
 */
const teamIds = vi.hoisted(() => ({
  devops: 9002,
  focusLeads: 9004,
  admins: 9001,
}));

vi.mock("./actors.js", () => ({
  resolveTeamId: vi.fn(async (_org: string, slug: string) => {
    if (slug === "devops") return teamIds.devops;
    if (slug === "focus-leads") return teamIds.focusLeads;
    if (slug === "admins") return teamIds.admins;
    throw new Error(`resolveTeamId: unexpected slug "${slug}"`);
  }),
  resolveAppId: vi.fn(),
}));

vi.mock("./api.js", () => ({
  listRulesets: vi.fn(async () => []),
  getRuleset: vi.fn(),
  createRuleset: vi.fn(async () => ({})),
  updateRuleset: vi.fn(async () => ({})),
  deleteRuleset: vi.fn(async () => undefined),
  getFileContent: vi.fn(async () => null as string | null),
}));

import { resolveAppId } from "./actors.js";
import { createRuleset, getFileContent } from "./api.js";
import { runGithubRulesets } from "./commands.js";

const mockResolveAppId = vi.mocked(resolveAppId);

beforeEach(() => {
  mockResolveAppId.mockReset();
});

function captureConsole() {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return {
    log,
    err,
    restore: () => {
      log.mockRestore();
      err.mockRestore();
    },
  };
}

describe("resolving the platform App and Renovate", () => {
  it("succeeds and includes Renovate in the plan when both Apps resolve", async () => {
    mockResolveAppId.mockImplementation(async (_org, slug) => {
      if (slug === "devdogs-platform") return 4595259;
      if (slug === "renovate") return 7001;
      throw new Error(`unexpected app slug "${slug}"`);
    });
    const { log, err, restore } = captureConsole();

    const code = await runGithubRulesets(["--json"]);

    expect(code).toBe(0);
    expect(err).not.toHaveBeenCalled();
    const printed = JSON.parse(log.mock.calls[0]![0] as string) as {
      creates: {
        desired: { name: string; bypass_actors: { actor_id: number }[] };
      }[];
    };
    const allBranches = printed.creates.find((c) => c.desired.name === "~ALL")!;
    expect(allBranches.desired.bypass_actors.map((a) => a.actor_id)).toContain(
      7001,
    );
    restore();
  });

  it("warns and omits Renovate from the plan when it cannot be resolved, without failing", async () => {
    mockResolveAppId.mockImplementation(async (_org, slug) => {
      if (slug === "devdogs-platform") return 4595259;
      throw new Error("404 Not Found");
    });
    const { log, err, restore } = captureConsole();

    const code = await runGithubRulesets(["--json"]);

    expect(code).toBe(0);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Renovate"));
    const printed = JSON.parse(log.mock.calls[0]![0] as string) as {
      creates: {
        desired: {
          name: string;
          bypass_actors: { actor_id: number; actor_type: string }[];
        };
      }[];
    };
    const allBranches = printed.creates.find((c) => c.desired.name === "~ALL")!;
    expect(
      allBranches.desired.bypass_actors.every(
        (a) => a.actor_type !== "Integration",
      ),
    ).toBe(true);
    restore();
  });

  it("fails outright when the platform App (required) cannot be resolved", async () => {
    mockResolveAppId.mockImplementation(async (_org, slug) => {
      throw new Error(`no installation for "${slug}"`);
    });
    const { err, restore } = captureConsole();

    const code = await runGithubRulesets([]);

    expect(code).toBe(1);
    expect(err).toHaveBeenCalled();
    restore();
  });
});

describe("--repo Backstage", () => {
  const ciWith = "on:\n  pull_request:\n  merge_group:\n";

  function resolveWithDeployApp(deploy: boolean) {
    mockResolveAppId.mockImplementation(async (_org, slug) => {
      if (slug === "devdogs-deploy-pr" && deploy) return 7777;
      throw new Error(`no installation for "${slug}"`);
    });
  }

  beforeEach(() => {
    vi.mocked(createRuleset).mockClear();
    vi.mocked(getFileContent).mockReset();
  });

  it("rejects an unmanaged repo", async () => {
    const { err, restore } = captureConsole();
    expect(await runGithubRulesets(["--repo", "Other"])).toBe(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("no desired"));
    restore();
  });

  it("explains in a dry run why the merge queue is withheld, and notes the missing deploy-PR App", async () => {
    resolveWithDeployApp(false);
    vi.mocked(getFileContent).mockResolvedValue("on:\n  push:\n");
    const { log, restore } = captureConsole();
    expect(await runGithubRulesets(["--repo", "Backstage"])).toBe(0);
    const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain('blocked  "main-merge-queue"');
    expect(printed).toContain("no merge_group trigger");
    expect(printed).toContain("create the App first");
    expect(printed).not.toContain('create   "deploy/devdogsuga"');
    restore();
  });

  it("refuses to create the merge queue on --apply while ci.yaml lacks merge_group", async () => {
    resolveWithDeployApp(false);
    vi.mocked(getFileContent).mockResolvedValue("on:\n  push:\n");
    const { restore } = captureConsole();
    expect(
      await runGithubRulesets(["--repo", "Backstage", "--apply", "--yes"]),
    ).toBe(0);
    const created = vi.mocked(createRuleset).mock.calls.map((c) => c[1].name);
    expect(created).toContain("main-ci");
    expect(created).not.toContain("main-merge-queue");
    restore();
  });

  it("creates the merge queue and deploy ruleset once merge_group exists and the App resolves", async () => {
    resolveWithDeployApp(true);
    vi.mocked(getFileContent).mockResolvedValue(ciWith);
    const { restore } = captureConsole();
    expect(
      await runGithubRulesets(["--repo", "Backstage", "--apply", "--yes"]),
    ).toBe(0);
    const created = vi.mocked(createRuleset).mock.calls.map((c) => c[1].name);
    expect(created).toContain("main-merge-queue");
    expect(created).toContain("deploy/devdogsuga");
    restore();
  });
});
