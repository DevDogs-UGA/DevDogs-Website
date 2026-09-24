import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `commands.ts` orchestrates four resolved ids and a handful of `gh` calls;
 * every one of those is mocked here so this suite is about ORCHESTRATION —
 * what happens when Renovate's App id cannot be resolved, and what happens
 * when a REQUIRED id (devops/admins/the platform App) cannot be — not about
 * what `gh` itself returns. `desired.test.ts` and `diff.test.ts` cover the
 * pure shape and the diff; `api.test.ts`/`actors.test.ts` cover the `gh`
 * invocations themselves.
 */
const teamIds = vi.hoisted(() => ({ devops: 9002, admins: 9001 }));

vi.mock("./actors.js", () => ({
  resolveTeamId: vi.fn(async (_org: string, slug: string) => {
    if (slug === "devops") return teamIds.devops;
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
}));

import { resolveAppId } from "./actors.js";
import { runGithubRulesets } from "./commands.js";

const mockResolveAppId = vi.mocked(resolveAppId);

beforeEach(() => {
  mockResolveAppId.mockReset();
});

function captureConsole() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
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
      creates: { desired: { name: string; bypass_actors: { actor_id: number }[] } }[];
    };
    const allBranches = printed.creates.find((c) => c.desired.name === "~ALL")!;
    expect(allBranches.desired.bypass_actors.map((a) => a.actor_id)).toContain(7001);
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
      creates: { desired: { name: string; bypass_actors: { actor_id: number; actor_type: string }[] } }[];
    };
    const allBranches = printed.creates.find((c) => c.desired.name === "~ALL")!;
    expect(
      allBranches.desired.bypass_actors.every((a) => a.actor_type !== "Integration"),
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
