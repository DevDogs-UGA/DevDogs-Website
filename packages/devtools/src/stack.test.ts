/**
 * `reconcileConfigAfterReset`: `db reset`'s best-effort trigger for the local
 * config reconcile route. Both `reachable` and `fetch` are injected (see
 * `ReconcileConfigDeps`) so these run with no real dev server and no
 * `vi.stubGlobal` on the network.
 *
 * Also `runStackCommand("start", …)`'s interaction with a failing bucket
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

const supabase = vi.fn(async (..._args: string[]) => 0);
const supabaseCapture = vi.fn(
  async (..._args: string[]) => "API_URL=http://127.0.0.1:54321\n",
);
const seedBuckets = vi.fn(async () => 0);
vi.mock("./db/run.js", () => ({
  dbPush: vi.fn(),
  generateTypes: vi.fn(),
  seedBuckets: (...args: Parameters<typeof seedBuckets>) =>
    seedBuckets(...args),
  supabase: (...args: string[]) => supabase(...args),
  supabaseCapture: (...args: string[]) => supabaseCapture(...args),
}));

let repoRoot = "";
vi.mock("./repo/root.js", () => ({
  findRepoRoot: () => repoRoot,
}));

const listContainerNames = vi.fn((): string[] | null => []);
const readProjectId = vi.fn((): string | null => "DevDogsUGA");
vi.mock("./repo/supabase-project.js", async () => {
  const actual = await vi.importActual<
    typeof import("./repo/supabase-project.js")
  >("./repo/supabase-project.js");
  return {
    ...actual,
    listContainerNames: () => listContainerNames(),
    readProjectId: (root: string) => readProjectId(root),
  };
});

const refreshSessionEnv = vi.fn(async () => ["refreshed .env.generated"]);
vi.mock("./db/session-refresh.js", () => ({
  refreshSessionEnv: () => refreshSessionEnv(),
}));

import { reconcileConfigAfterReset, runStackCommand } from "./stack.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json" },
  });
}

describe("reconcileConfigAfterReset", () => {
  it("reports the manual step when nothing is listening", async () => {
    const fetchSpy = vi.fn();
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => false),
      fetch: fetchSpy,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join(" ")).toContain("nothing is listening");
    expect(lines.join(" ")).toContain("pnpm --filter platform dev");
  });

  it("requests the config-reconcile route with no auth header, and reports success", async () => {
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ success: true, counts: {} }),
    );
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3000/cron/config-reconcile");
    // No CRON_SECRET, matching the route's own local-request exemption.
    expect(init).toBeUndefined();
    expect(lines).toEqual([
      "Meetings and workshops reconciled from @devdogsuga/events.",
    ]);
  });

  it("reports an aborted reconcile without pretending it succeeded", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ success: false, reason: "events has zero meetings" }),
    );
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("aborted");
    expect(lines.join(" ")).toContain("events has zero meetings");
  });

  it("reports a non-2xx response instead of throwing", async () => {
    const fetchSpy = vi.fn(async () => new Response("nope", { status: 500 }));
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("HTTP 500");
  });

  it("reports a network failure instead of rejecting", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("ECONNRESET");
  });
});

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
    const { code, lines } = await runStackCommand("start", null);

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

    const { code, lines } = await runStackCommand("start", null);

    // The failure is still reported...
    expect(code).toBe(1);
    // ...but the environment was refreshed anyway, because the file changed.
    expect(refreshSessionEnv).toHaveBeenCalledTimes(1);
    expect(lines).toContain("refreshed .env.generated");
  });

  it("does not refresh when `supabase start` itself fails — nothing on disk changed", async () => {
    supabase.mockResolvedValue(1);

    const { code, lines } = await runStackCommand("start", null);

    expect(code).toBe(1);
    expect(refreshSessionEnv).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("surfaces a foreign-stack hint when `supabase start` fails with another project's containers up", async () => {
    supabase.mockResolvedValue(1);
    listContainerNames.mockReturnValue(["supabase_kong_DevDogs-Website"]);
    readProjectId.mockReturnValue("DevDogsUGA");

    const { code, lines } = await runStackCommand("start", null);

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

    const { code, lines } = await runStackCommand("start", null);

    expect(code).toBe(1);
    expect(lines).toEqual([]);
  });

  it("does not refresh when `supabase status -o env` throws before the file is written", async () => {
    supabaseCapture.mockRejectedValue(new Error("supabase CLI crashed"));

    const { code, lines } = await runStackCommand("start", null);

    expect(code).toBe(1);
    expect(refreshSessionEnv).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });
});
