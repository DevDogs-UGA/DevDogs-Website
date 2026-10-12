import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.fn();
vi.mock("node:child_process", () => ({ execFileSync }));

const { detectLocalSupabase } = await import("./db.js");

const STATUS =
  'API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="local-service-key"\n';

function notFound(): Error {
  return Object.assign(new Error("spawn supabase ENOENT"), { code: "ENOENT" });
}

function productRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "devtools-detect-"));
  writeFileSync(
    join(root, "devtools.config.json"),
    JSON.stringify({
      product: "dogdays",
      name: "DogDays",
      supabase: { version: "2.117.0", schemas: ["dogdays"] },
      types: { kind: "typescript", out: "src/supabase/database.types.ts" },
    }),
  );
  return root;
}

describe("detectLocalSupabase — finding the CLI", () => {
  beforeEach(() => execFileSync.mockReset());

  it("uses a global supabase when there is one", () => {
    execFileSync.mockReturnValueOnce(STATUS);
    const config = detectLocalSupabase(mkdtempSync(join(tmpdir(), "x-")));
    expect(config).toEqual({
      apiUrl: "http://127.0.0.1:54321",
      serviceRoleKey: "local-service-key",
    });
    expect(execFileSync.mock.calls[0]![0]).toBe("supabase");
  });

  it("falls back to the product's pinned CLI through npx when none is installed", () => {
    const root = productRepo();
    execFileSync
      .mockImplementationOnce(() => {
        throw notFound();
      })
      .mockImplementationOnce(() => {
        throw new Error("pnpm: no workspace");
      })
      .mockReturnValueOnce(STATUS);
    expect(detectLocalSupabase(root).apiUrl).toBe("http://127.0.0.1:54321");
    expect(execFileSync.mock.calls[2]!.slice(0, 2)).toEqual([
      "npx",
      ["--yes", "supabase@2.117.0", "status", "-o", "env"],
    ]);
  });

  it("says the CLI is missing outside a product repo when nothing works", () => {
    execFileSync
      .mockImplementationOnce(() => {
        throw notFound();
      })
      .mockImplementationOnce(() => {
        throw new Error("pnpm: no workspace");
      });
    expect(() =>
      detectLocalSupabase(mkdtempSync(join(tmpdir(), "y-"))),
    ).toThrow(/supabase CLI not found/);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });
});
