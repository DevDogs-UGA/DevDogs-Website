/**
 * Unit tests for `ensureGeneratedEnvFile` — regenerating `.env.generated`
 * from a running local stack started elsewhere (a sibling workspace
 * sharing this repo's `project_id`), without ever touching a real
 * filesystem, TCP socket, Docker daemon, or Supabase CLI. Every dependency
 * is injected; see `EnsureGeneratedEnvDeps`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ensureGeneratedEnvFile,
  type EnsureGeneratedEnvDeps,
} from "./generated-env.js";

function fakeDeps(overrides: Partial<EnsureGeneratedEnvDeps> = {}): {
  deps: EnsureGeneratedEnvDeps;
  spies: {
    probeLocalStack: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    captureStatus: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    listContainerNames: ReturnType<typeof vi.fn>;
    projectId: ReturnType<typeof vi.fn>;
  };
} {
  const probeLocalStack = vi.fn(async () => true);
  const exists = vi.fn(() => false);
  const captureStatus = vi.fn(async () => "API_URL=http://127.0.0.1:54321\n");
  const write = vi.fn(async () => undefined);
  const listContainerNames = vi.fn((): string[] | null => []);
  const projectId = vi.fn((): string | null => "DevDogsUGA");

  const deps: EnsureGeneratedEnvDeps = {
    probeLocalStack,
    exists,
    captureStatus,
    write,
    listContainerNames,
    projectId,
    repoRoot: "/repo",
    ...overrides,
  };
  return {
    deps,
    spies: {
      probeLocalStack,
      exists,
      captureStatus,
      write,
      listContainerNames,
      projectId,
    },
  };
}

describe("ensureGeneratedEnvFile", () => {
  it("does nothing for a non-development tier — no probe, no subprocess", async () => {
    const { deps, spies } = fakeDeps();

    const result = await ensureGeneratedEnvFile("staging", undefined, deps);

    expect(result).toEqual({ outcome: "skipped" });
    expect(spies.exists).not.toHaveBeenCalled();
    expect(spies.probeLocalStack).not.toHaveBeenCalled();
    expect(spies.captureStatus).not.toHaveBeenCalled();
  });

  it("does nothing when DEV_DB is remote — no probe, no subprocess", async () => {
    const { deps, spies } = fakeDeps();

    const result = await ensureGeneratedEnvFile("development", "remote", deps);

    expect(result).toEqual({ outcome: "skipped" });
    expect(spies.exists).not.toHaveBeenCalled();
    expect(spies.probeLocalStack).not.toHaveBeenCalled();
    expect(spies.captureStatus).not.toHaveBeenCalled();
  });

  it("does nothing when .env.generated already exists — no subprocess", async () => {
    const { deps, spies } = fakeDeps({ exists: vi.fn(() => true) });

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({ outcome: "skipped" });
    expect(spies.probeLocalStack).not.toHaveBeenCalled();
    expect(spies.captureStatus).not.toHaveBeenCalled();
  });

  it("does nothing when the file is missing but nothing is listening", async () => {
    const { deps, spies } = fakeDeps({
      probeLocalStack: vi.fn(async () => false),
    });

    const result = await ensureGeneratedEnvFile("development", undefined, deps);

    expect(result).toEqual({ outcome: "skipped" });
    expect(spies.captureStatus).not.toHaveBeenCalled();
  });

  it("regenerates the file when it is missing and the port is listening", async () => {
    const { deps, spies } = fakeDeps();

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({
      outcome: "wrote",
      line: "devtools: wrote .env.generated from the running local stack",
    });
    expect(spies.write).toHaveBeenCalledWith(
      "/repo/.env.generated",
      "API_URL=http://127.0.0.1:54321\n",
    );
  });

  it("regenerates when devDatabase is undefined (the probe-decides case)", async () => {
    const { deps } = fakeDeps();

    const result = await ensureGeneratedEnvFile("development", undefined, deps);

    expect(result.outcome).toBe("wrote");
  });

  it("reports a foreign stack when supabase status fails and a foreign container is found", async () => {
    const { deps } = fakeDeps({
      captureStatus: vi.fn(async () => {
        throw new Error("failed to connect");
      }),
      listContainerNames: vi.fn(() => [
        "supabase_kong_DevDogs-Website",
        "other",
      ]),
      projectId: vi.fn(() => "DevDogsUGA"),
    });

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({
      outcome: "foreign",
      projectId: "DevDogs-Website",
      line:
        'devtools: The stack on port 54321 belongs to project "DevDogs-Website", ' +
        "not this checkout's. Stop it with `supabase stop --project-id " +
        "DevDogs-Website` then `pnpm devtools supabase start`.",
    });
  });

  it("reports unreachable when supabase status fails and no foreign container is found", async () => {
    const { deps } = fakeDeps({
      captureStatus: vi.fn(async () => {
        throw new Error("connection refused");
      }),
      listContainerNames: vi.fn(() => ["supabase_kong_DevDogsUGA"]),
      projectId: vi.fn(() => "DevDogsUGA"),
    });

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({ outcome: "unreachable" });
  });

  it("reports unreachable when supabase status fails and Docker itself cannot be read", async () => {
    const { deps } = fakeDeps({
      captureStatus: vi.fn(async () => {
        throw new Error("failed to connect");
      }),
      listContainerNames: vi.fn(() => null),
    });

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({ outcome: "unreachable" });
  });

  it("reports unreachable rather than foreign when this repo's own project id is unreadable", async () => {
    const { deps } = fakeDeps({
      captureStatus: vi.fn(async () => {
        throw new Error("failed to connect");
      }),
      listContainerNames: vi.fn(() => ["supabase_kong_DevDogs-Website"]),
      projectId: vi.fn(() => null),
    });

    const result = await ensureGeneratedEnvFile("development", "local", deps);

    expect(result).toEqual({ outcome: "unreachable" });
  });

  it("writes the same file into every mirror root, and wants it in all of them", async () => {
    const { deps, spies } = fakeDeps({ mirrorRoots: ["/repo/devdogsuga"] });
    await ensureGeneratedEnvFile("development", undefined, deps);
    expect(spies.write.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "/repo/.env.generated",
      "/repo/devdogsuga/.env.generated",
    ]);
  });
});
