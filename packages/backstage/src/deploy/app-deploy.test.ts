/**
 * `deploy <app>`, the orchestrator: the token check, the secrets file written
 * and removed around the upload, and the wrangler call. Everything it drives
 * is faked (the spawn, the file builder, the registry), so what is asserted is
 * the order and the cleanup.
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ChildProcess from "node:child_process";

const spawned = vi.hoisted(() => ({
  calls: [] as { command: string; args: string[] }[],
  exitCode: 0,
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  spawn: (command: string, args: string[]) => {
    spawned.calls.push({ command, args });
    return {
      on: (event: string, listener: (code: number) => void) => {
        if (event === "exit") queueMicrotask(() => listener(spawned.exitCode));
      },
    };
  },
}));

vi.mock("@devdogsuga/cli-core/repo/peers", () => ({
  loadEnvLoad: async () => ({
    HYPERDRIVE_LOCAL_CONNECTION_ENV: "ALIAS",
    applyWranglerLocalDatabaseAlias: () => undefined,
  }),
}));

vi.mock("@devdogsuga/cli-core/env/discovery", () => ({
  loadRegistry: vi.fn(async () => undefined),
}));

const built = vi.hoisted(() => ({ dir: "", file: "" }));
vi.mock("./secrets-file.js", () => ({
  runDeploySecretsFile: vi.fn(async () => ({
    dir: built.dir,
    file: built.file,
    keys: ["A"],
    omitted: [],
  })),
}));

import { runDeploySecretsFile } from "./secrets-file.js";
import { DeployError } from "./report.js";
import { runAppDeploy } from "./commands.js";

let stderr: string;

beforeEach(() => {
  stderr = "";
  spawned.calls = [];
  spawned.exitCode = 0;
  built.dir = mkdtempSync(join(tmpdir(), "app-deploy-test-"));
  built.file = join(built.dir, "platform.json");
  writeFileSync(built.file, "{}");
  process.env.CLOUDFLARE_API_TOKEN = "a-token";
  delete process.env.SENTRY_RELEASE;
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.DEPLOY_ENV;
  process.exitCode = undefined;
});

describe("deploy <app>", () => {
  it("writes the secrets file, uploads it with the deploy, then removes it", async () => {
    await runAppDeploy("platform", ["--tier", "staging"]);

    expect(runDeploySecretsFile).toHaveBeenCalledWith({
      app: "platform",
      githubOutput: false,
    });
    expect(spawned.calls).toHaveLength(1);
    const { command, args } = spawned.calls[0]!;
    expect(command).toBe("pnpm");
    expect(args).toEqual([
      "--filter",
      "platform",
      "exec",
      "wrangler",
      "deploy",
      "-e",
      "staging",
      "--secrets-file",
      built.file,
    ]);
    expect(existsSync(built.dir)).toBe(false);
  });

  it("sends the deploy's release as a var, not through the secrets file", async () => {
    process.env.SENTRY_RELEASE = "abc123";
    await runAppDeploy("platform", ["--tier", "production"]);
    expect(spawned.calls[0]!.args.slice(-2)).toEqual([
      "--var",
      "SENTRY_RELEASE:abc123",
    ]);
  });

  it("removes the secrets file when wrangler fails, and passes its exit code on", async () => {
    spawned.exitCode = 3;
    await runAppDeploy("platform", ["--tier", "staging"]);
    expect(existsSync(built.dir)).toBe(false);
    expect(process.exitCode).toBe(3);
  });

  it("refuses without CLOUDFLARE_API_TOKEN, before writing or running anything", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(
      runAppDeploy("platform", ["--tier", "staging"]),
    ).rejects.toThrow(DeployError);
    expect(runDeploySecretsFile).not.toHaveBeenCalled();
    expect(spawned.calls).toEqual([]);
  });

  it("needs a tier, from --tier or DEPLOY_ENV", async () => {
    await expect(runAppDeploy("platform", [])).rejects.toThrow(/--tier/);
    process.env.DEPLOY_ENV = "staging";
    await runAppDeploy("platform", []);
    expect(spawned.calls).toHaveLength(1);
  });

  it("--dry-run lists the steps, needs no token, and touches nothing", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await runAppDeploy("platform", ["--tier", "staging", "--dry-run"]);
    expect(stderr).toContain("Check CLOUDFLARE_API_TOKEN");
    expect(stderr).toContain("Deploy platform (staging)");
    expect(runDeploySecretsFile).not.toHaveBeenCalled();
    expect(spawned.calls).toEqual([]);
  });

  it("uploads a secrets file somebody else wrote as it is, and leaves it", async () => {
    await runAppDeploy("platform", ["--tier", "staging"], {
      secretsFile: built.file,
    });
    expect(runDeploySecretsFile).not.toHaveBeenCalled();
    expect(spawned.calls[0]!.args).toContain(built.file);
    expect(existsSync(built.dir)).toBe(true);
  });
});
