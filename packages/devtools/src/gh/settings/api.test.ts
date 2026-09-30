import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  interface ExecCall {
    file: string;
    args: string[];
  }
  interface SpawnCall {
    file: string;
    args: string[];
    written: unknown;
  }

  const state = {
    execCalls: [] as ExecCall[],
    execResult: { stdout: "" } as { stdout: string } | Error,
    spawnCalls: [] as SpawnCall[],
    spawnExit: { code: 0, stdout: "", stderr: "" },
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

  function spawn(file: string, args: string[]) {
    const call: SpawnCall = { file, args, written: undefined };
    state.spawnCalls.push(call);
    const handlers = new Map<string, (arg?: unknown) => void>();
    let onStdout: ((chunk: Buffer) => void) | undefined;
    let onStderr: ((chunk: Buffer) => void) | undefined;
    return {
      stdout: {
        on: (_event: string, cb: (chunk: Buffer) => void) => {
          onStdout = cb;
        },
      },
      stderr: {
        on: (_event: string, cb: (chunk: Buffer) => void) => {
          onStderr = cb;
        },
      },
      on: (event: string, cb: (arg?: unknown) => void) => {
        handlers.set(event, cb);
      },
      stdin: {
        end: (value?: unknown) => {
          call.written = value;
          queueMicrotask(() => {
            if (state.spawnExit.stdout)
              onStdout?.(Buffer.from(state.spawnExit.stdout));
            if (state.spawnExit.stderr)
              onStderr?.(Buffer.from(state.spawnExit.stderr));
            handlers.get("close")?.(state.spawnExit.code);
          });
        },
      },
    };
  }

  return { state, execFile, spawn };
});

vi.mock("node:child_process", () => ({
  execFile: fake.execFile,
  spawn: fake.spawn,
}));

import {
  GhSettingsError,
  addDeploymentBranchPolicy,
  deleteDeploymentBranchPolicy,
  getActionsPermissions,
  getDeploymentBranchPolicies,
  getEnvironment,
  getRepo,
  getSelectedActions,
  getVulnerabilityAlertsEnabled,
  patchSecurityAndAnalysis,
  setActionsPermissions,
  setVulnerabilityAlertsEnabled,
} from "./api.js";

beforeEach(() => {
  fake.state.execCalls.length = 0;
  fake.state.execResult = { stdout: "" };
  fake.state.spawnCalls.length = 0;
  fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
});

const repo = { owner: "DevDogsUGA", repo: "DevDogsUGA" };

describe("reads", () => {
  it("gets the repo, including security_and_analysis", async () => {
    fake.state.execResult = {
      stdout:
        '{"private":false,"security_and_analysis":{"secret_scanning":{"status":"enabled"}}}',
    };
    const result = await getRepo(repo);
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA",
    ]);
    expect(result.security_and_analysis?.secret_scanning?.status).toBe(
      "enabled",
    );
  });

  it("reads vulnerability-alerts as enabled on a 204 (no error thrown)", async () => {
    fake.state.execResult = { stdout: "" };
    await expect(getVulnerabilityAlertsEnabled(repo)).resolves.toBe(true);
  });

  it("reads vulnerability-alerts as disabled on a 404", async () => {
    fake.state.execResult = Object.assign(new Error("gone"), {
      stderr: "HTTP 404 Not Found",
    });
    await expect(getVulnerabilityAlertsEnabled(repo)).resolves.toBe(false);
  });

  it("rethrows a non-404 failure from vulnerability-alerts as GhSettingsError", async () => {
    fake.state.execResult = Object.assign(new Error("nope"), {
      stderr: "HTTP 403 Forbidden",
    });
    await expect(getVulnerabilityAlertsEnabled(repo)).rejects.toBeInstanceOf(
      GhSettingsError,
    );
  });

  it("gets actions permissions, sha_pinning_required included", async () => {
    fake.state.execResult = {
      stdout:
        '{"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}',
    };
    const result = await getActionsPermissions(repo);
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/actions/permissions",
    ]);
    expect(result.sha_pinning_required).toBe(true);
  });

  it("reads selected-actions as the empty allowlist on a 409 — allowed_actions isn't 'selected' live", async () => {
    fake.state.execResult = Object.assign(new Error("nope"), {
      stderr:
        "gh: All actions and workflows are allowed on this repository (Conflict)",
    });
    await expect(getSelectedActions(repo)).resolves.toEqual({
      github_owned_allowed: false,
      verified_allowed: false,
      patterns_allowed: [],
    });
  });

  it("rethrows a non-409 failure from getSelectedActions", async () => {
    fake.state.execResult = Object.assign(new Error("nope"), {
      stderr: "HTTP 500",
    });
    await expect(getSelectedActions(repo)).rejects.toBeInstanceOf(
      GhSettingsError,
    );
  });

  it("returns null from getEnvironment on a 404, rather than throwing", async () => {
    fake.state.execResult = Object.assign(new Error("gone"), {
      stderr: "HTTP 404 Not Found",
    });
    await expect(getEnvironment(repo, "production")).resolves.toBeNull();
  });

  it("rethrows a non-404 failure from getEnvironment", async () => {
    fake.state.execResult = Object.assign(new Error("nope"), {
      stderr: "HTTP 500",
    });
    await expect(getEnvironment(repo, "production")).rejects.toBeInstanceOf(
      GhSettingsError,
    );
  });

  it("gets an environment's deployment branch policies, defaulting to []", async () => {
    fake.state.execResult = {
      stdout: '{"total_count":1,"branch_policies":[{"id":1,"name":"main"}]}',
    };
    const result = await getDeploymentBranchPolicies(repo, "staging");
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/environments/staging/deployment-branch-policies",
    ]);
    expect(result).toEqual([{ id: 1, name: "main" }]);
  });

  it("wraps a failed read in GhSettingsError", async () => {
    fake.state.execResult = Object.assign(new Error("boom"), {
      stderr: "HTTP 500",
    });
    await expect(getRepo(repo)).rejects.toBeInstanceOf(GhSettingsError);
  });
});

describe("writes", () => {
  it("PATCHes security_and_analysis, nesting the given fields", async () => {
    fake.state.spawnExit = { code: 0, stdout: "{}", stderr: "" };
    await patchSecurityAndAnalysis(repo, {
      secret_scanning: { status: "enabled" },
    });
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA",
      "-X",
      "PATCH",
      "--input",
      "-",
    ]);
    expect(JSON.parse(call.written as string)).toEqual({
      security_and_analysis: { secret_scanning: { status: "enabled" } },
    });
  });

  it("enables vulnerability alerts via PUT with no body", async () => {
    fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
    await setVulnerabilityAlertsEnabled(repo, true);
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/vulnerability-alerts",
      "-X",
      "PUT",
    ]);
    expect(call.written).toBeUndefined();
  });

  it("disables vulnerability alerts via DELETE", async () => {
    fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
    await setVulnerabilityAlertsEnabled(repo, false);
    expect(fake.state.spawnCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/vulnerability-alerts",
      "-X",
      "DELETE",
    ]);
  });

  it("PUTs actions/permissions with sha_pinning_required in the body", async () => {
    fake.state.spawnExit = { code: 0, stdout: "{}", stderr: "" };
    await setActionsPermissions(repo, {
      enabled: true,
      allowed_actions: "selected",
      sha_pinning_required: true,
    });
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/actions/permissions",
      "-X",
      "PUT",
      "--input",
      "-",
    ]);
    expect(JSON.parse(call.written as string)).toEqual({
      enabled: true,
      allowed_actions: "selected",
      sha_pinning_required: true,
    });
  });

  it("adds a deployment branch policy by POSTing {name: pattern}", async () => {
    fake.state.spawnExit = { code: 0, stdout: "{}", stderr: "" };
    await addDeploymentBranchPolicy(repo, "staging", "main");
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/environments/staging/deployment-branch-policies",
      "-X",
      "POST",
      "--input",
      "-",
    ]);
    expect(JSON.parse(call.written as string)).toEqual({ name: "main" });
  });

  it("deletes a deployment branch policy by id", async () => {
    fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
    await deleteDeploymentBranchPolicy(repo, "staging", 7);
    expect(fake.state.spawnCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/environments/staging/deployment-branch-policies/7",
      "-X",
      "DELETE",
    ]);
  });

  it("rejects with GhSettingsError on a non-zero exit", async () => {
    fake.state.spawnExit = {
      code: 1,
      stdout: "",
      stderr: "HTTP 403 Forbidden",
    };
    await expect(
      setActionsPermissions(repo, { enabled: true }),
    ).rejects.toBeInstanceOf(GhSettingsError);
  });
});
