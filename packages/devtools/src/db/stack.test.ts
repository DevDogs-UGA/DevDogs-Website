/**
 * `runStackCommand("start")`'s interaction with a failing bucket
 * seed: `startLocalStack` writes `.env.generated` BEFORE `seedBuckets` runs,
 * so a nonzero `seedBuckets` exit must still refresh this process's entered
 * environment (`refreshSessionEnv`) — the file on disk genuinely changed —
 * while still reporting the failing code; and a failed `supabase start`
 * surfacing a foreign-stack hint (see `./repo/supabase-project.ts`'s
 * header). `./db/run.js`, `./repo/root.js`, `./repo/supabase-project.js`
 * and `./db/session-refresh.js` are mocked so this never spawns the real
 * Supabase CLI, a real `docker ps`, or touches the real
 * filesystem/`process.env`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RepoSupabaseProject from "@devdogsuga/cli-core/repo/supabase-project";

const supabase = vi.fn(async (..._args: string[]) => 0);
const supabaseCapture = vi.fn(
  async (..._args: string[]) => "API_URL=http://127.0.0.1:54321\n",
);
const seedBuckets = vi.fn(async () => 0);
vi.mock("@devdogsuga/cli-core/db/run", () => ({
  dbPush: vi.fn(),
  generateTypes: vi.fn(),
  seedBuckets: (...args: Parameters<typeof seedBuckets>) =>
    seedBuckets(...args),
  supabase: (...args: string[]) => supabase(...args),
  supabaseCapture: (...args: string[]) => supabaseCapture(...args),
}));

let repoRoot = "";
vi.mock("@devdogsuga/cli-core/repo/root", () => ({
  findRepoRoot: () => repoRoot,
}));

const listContainerNames = vi.fn((): string[] | null => []);
const readProjectId = vi.fn((): string | null => "DevDogsUGA");
vi.mock("@devdogsuga/cli-core/repo/supabase-project", async () => {
  const actual = await vi.importActual<typeof RepoSupabaseProject>(
    "@devdogsuga/cli-core/repo/supabase-project",
  );
  return {
    ...actual,
    listContainerNames: () => listContainerNames(),
    readProjectId: (root: string) => readProjectId(root),
  };
});

const refreshSessionEnv = vi.fn(async () => ["refreshed .env.generated"]);
vi.mock("./session-refresh.js", () => ({
  refreshSessionEnv: () => refreshSessionEnv(),
}));

import { runStackCommand } from "./stack.js";

describe('runStackCommand("start", …)', () => {
  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "stack-start-"));
    supabase.mockReset().mockResolvedValue(0);
    supabaseCapture
      .mockReset()
      .mockResolvedValue("API_URL=http://127.0.0.1:54321\n");
    seedBuckets.mockReset().mockResolvedValue(0);
    refreshSessionEnv.mockClear();
    listContainerNames.mockReset().mockReturnValue([]);
    readProjectId.mockReset().mockReturnValue("DevDogsUGA");
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("refreshes the session and reports success when the buckets seed succeeds", async () => {
    const { code, lines } = await runStackCommand("start");

    expect(code).toBe(0);
    expect(refreshSessionEnv).toHaveBeenCalledTimes(1);
    expect(lines).toContain("refreshed .env.generated");
    // `.env.generated` really was written, independent of the mock.
    await expect(
      readFile(join(repoRoot, ".env.generated"), "utf8"),
    ).resolves.toContain("API_URL=http://127.0.0.1:54321");
  });

  it("still refreshes when seedBuckets fails AFTER .env.generated was already written", async () => {
    // This is BUG 3: `.env.generated` is on disk with fresh values the
    // instant `supabaseCapture` returns, well before `seedBuckets` runs — a
    // failure there must not leave the session's entered environment (and
    // hence every child `with-env` in it) pointed at whatever was loaded
    // before `db start` ran.
    seedBuckets.mockResolvedValue(1);

    const { code, lines } = await runStackCommand("start");

    // The failure is still reported...
    expect(code).toBe(1);
    // ...but the environment was refreshed anyway, because the file changed.
    expect(refreshSessionEnv).toHaveBeenCalledTimes(1);
    expect(lines).toContain("refreshed .env.generated");
  });

  it("does not refresh when `supabase start` itself fails — nothing on disk changed", async () => {
    supabase.mockResolvedValue(1);

    const { code, lines } = await runStackCommand("start");

    expect(code).toBe(1);
    expect(refreshSessionEnv).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("surfaces a foreign-stack hint when `supabase start` fails with another project's containers up", async () => {
    supabase.mockResolvedValue(1);
    listContainerNames.mockReturnValue(["supabase_kong_DevDogs-Website"]);
    readProjectId.mockReturnValue("DevDogsUGA");

    const { code, lines } = await runStackCommand("start");

    expect(code).toBe(1);
    expect(refreshSessionEnv).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('project "DevDogs-Website"');
    expect(lines[0]).toContain("supabase stop --project-id DevDogs-Website");
  });

  it("does not surface a hint when the failure has no foreign container to explain it", async () => {
    supabase.mockResolvedValue(1);
    listContainerNames.mockReturnValue(["supabase_kong_DevDogsUGA"]);
    readProjectId.mockReturnValue("DevDogsUGA");

    const { code, lines } = await runStackCommand("start");

    expect(code).toBe(1);
    expect(lines).toEqual([]);
  });

  it("does not refresh when `supabase status -o env` throws before the file is written", async () => {
    supabaseCapture.mockRejectedValue(new Error("supabase CLI crashed"));

    const { code, lines } = await runStackCommand("start");

    expect(code).toBe(1);
    expect(refreshSessionEnv).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });
});
