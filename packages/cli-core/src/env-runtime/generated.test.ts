import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGeneratedEnv } from "./generated.js";

let root: string;
const status = vi.fn(async () => 'API_URL="http://127.0.0.1:54321"\n');
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "generated-test-"));
  status.mockClear();
});
const up = async () => true;
const down = async () => false;

describe("ensureGeneratedEnv", () => {
  it("writes the file when the stack is listening and it is missing", async () => {
    const r = await ensureGeneratedEnv({ root, probe: up, status });
    expect(r).toEqual({ action: "written", file: ".env.generated" });
    expect(readFileSync(join(root, ".env.generated"), "utf8")).toContain(
      "API_URL",
    );
  });

  it("does nothing when the stack is down", async () => {
    expect(await ensureGeneratedEnv({ root, probe: down, status })).toEqual({
      action: "none",
    });
    expect(status).not.toHaveBeenCalled();
  });

  it("leaves a current file alone, without probing", async () => {
    writeFileSync(join(root, ".env.generated"), "A=1\n");
    const probe = vi.fn(up);
    expect(await ensureGeneratedEnv({ root, probe, status })).toEqual({
      action: "none",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("refreshes a file older than config.toml", async () => {
    mkdirSync(join(root, "supabase"));
    writeFileSync(join(root, ".env.generated"), "A=1\n");
    writeFileSync(join(root, "supabase", "config.toml"), "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(root, ".env.generated"), old, old);
    const r = await ensureGeneratedEnv({ root, probe: up, status });
    expect(r.action).toBe("refreshed");
  });

  it("reports failure and writes nothing on junk output", async () => {
    const r = await ensureGeneratedEnv({
      root,
      probe: up,
      status: async () => "Error: not running",
    });
    expect(r.action).toBe("failed");
  });

  it("from a Backstage root, runs supabase in devdogsuga/ and writes both roots", async () => {
    mkdirSync(join(root, "devdogsuga", "supabase"), { recursive: true });
    writeFileSync(join(root, "devdogsuga", "supabase", "config.toml"), "");
    const r = await ensureGeneratedEnv({ root, probe: up, status });
    expect(r).toEqual({ action: "written", file: ".env.generated" });
    expect(status).toHaveBeenCalledWith(join(root, "devdogsuga"));
    for (const dir of [root, join(root, "devdogsuga")]) {
      expect(readFileSync(join(dir, ".env.generated"), "utf8")).toContain(
        "API_URL",
      );
    }
  });
});
