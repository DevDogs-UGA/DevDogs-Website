import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const state = {
    execCalls: [] as { file: string; args: string[] }[],
    execResult: { stdout: "" } as { stdout: string } | Error,
  };
  const execFile: {
    (...args: unknown[]): void;
    [key: symbol]: unknown;
  } = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: async (
      file: string,
      args: string[],
    ) => {
      state.execCalls.push({ file, args });
      if (state.execResult instanceof Error) throw state.execResult;
      return state.execResult;
    },
  });
  return { state, execFile };
});

vi.mock("node:child_process", () => ({ execFile: fake.execFile }));

import { GhRulesetsError } from "./api.js";
import { resolveAppId, resolveTeamId } from "./actors.js";

beforeEach(() => {
  fake.state.execCalls.length = 0;
  fake.state.execResult = { stdout: "" };
});

describe("resolveTeamId", () => {
  it("reads the team's numeric id by org and slug", async () => {
    fake.state.execResult = { stdout: '{"id":18883125,"slug":"devops"}' };
    const id = await resolveTeamId("DevDogsUGA", "devops");
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "orgs/DevDogsUGA/teams/devops",
    ]);
    expect(id).toBe(18883125);
  });

  it("throws GhRulesetsError when the team GET fails", async () => {
    fake.state.execResult = Object.assign(new Error("nope"), {
      stderr: "HTTP 404",
    });
    await expect(resolveTeamId("DevDogsUGA", "ghost")).rejects.toBeInstanceOf(
      GhRulesetsError,
    );
  });
});

describe("resolveAppId", () => {
  it("finds the installation matching the given app_slug", async () => {
    fake.state.execResult = {
      stdout: JSON.stringify({
        total_count: 2,
        installations: [
          { app_id: 111, app_slug: "devdogs-platform-staging" },
          { app_id: 4595259, app_slug: "devdogs-platform" },
        ],
      }),
    };
    const id = await resolveAppId("DevDogsUGA", "devdogs-platform");
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "orgs/DevDogsUGA/installations",
    ]);
    expect(id).toBe(4595259);
  });

  it("throws GhRulesetsError when no installation matches the slug", async () => {
    fake.state.execResult = {
      stdout: JSON.stringify({
        installations: [{ app_id: 1, app_slug: "other" }],
      }),
    };
    await expect(
      resolveAppId("DevDogsUGA", "devdogs-platform"),
    ).rejects.toBeInstanceOf(GhRulesetsError);
  });
});
