import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HostedCredentialsMissingError,
  NoTierResolvedError,
  readHostedTargetFromEnvFiles,
  resolveHostedTargetInRepo,
} from "./target.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "oauth-target-"));
}

describe("readHostedTargetFromEnvFiles — outside a checkout", () => {
  it("reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY from .env.local when present", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, ".env.local"),
      'SUPABASE_URL="https://abcd.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY="sr-key"\n',
    );
    expect(readHostedTargetFromEnvFiles(dir)).toEqual({
      apiUrl: "https://abcd.supabase.co",
      serviceRoleKey: "sr-key",
    });
  });

  it("falls back to .env when .env.local is absent or incomplete", () => {
    const dir = tempDir();
    writeFileSync(join(dir, ".env"), 'SUPABASE_URL="https://efgh.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY="k2"\n');
    expect(readHostedTargetFromEnvFiles(dir)).toEqual({
      apiUrl: "https://efgh.supabase.co",
      serviceRoleKey: "k2",
    });
  });

  it("does not fall back to .env when .env.local has ONE of the two keys — treats it as incomplete", () => {
    const dir = tempDir();
    writeFileSync(join(dir, ".env.local"), 'SUPABASE_URL="https://abcd.supabase.co"\n');
    writeFileSync(join(dir, ".env"), 'SUPABASE_URL="https://efgh.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY="k2"\n');
    // .env.local is checked first and is incomplete, so this falls through to .env.
    expect(readHostedTargetFromEnvFiles(dir)).toEqual({
      apiUrl: "https://efgh.supabase.co",
      serviceRoleKey: "k2",
    });
  });

  it("returns an empty object when neither file has both keys", () => {
    const dir = tempDir();
    expect(readHostedTargetFromEnvFiles(dir)).toEqual({});
  });
});

describe("resolveHostedTargetInRepo — inside a checkout", () => {
  it("resolves a tier, enters its environment, and reads API_URL/SECRET_KEY", async () => {
    const enterEnvironment = vi.fn(async () => {});
    const resolveTier = vi.fn(async () => "staging" as const);
    const env = { API_URL: "https://staging-ref.supabase.co", SECRET_KEY: "staging-secret" };

    const target = await resolveHostedTargetInRepo(undefined, {
      resolveTier,
      enterEnvironment,
      env,
    });

    expect(resolveTier).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining("tier"),
    );
    expect(enterEnvironment).toHaveBeenCalledWith("staging");
    expect(target).toEqual({
      apiUrl: "https://staging-ref.supabase.co",
      serviceRoleKey: "staging-secret",
      kind: "hosted",
    });
  });

  it("throws NoTierResolvedError when resolveTier declines", async () => {
    await expect(
      resolveHostedTargetInRepo(undefined, {
        resolveTier: async () => null,
        enterEnvironment: vi.fn(),
        env: {},
      }),
    ).rejects.toThrow(NoTierResolvedError);
  });

  it("throws HostedCredentialsMissingError when the tier's env has no API_URL/SECRET_KEY", async () => {
    await expect(
      resolveHostedTargetInRepo(undefined, {
        resolveTier: async () => "production",
        enterEnvironment: vi.fn(async () => {}),
        env: {},
      }),
    ).rejects.toThrow(HostedCredentialsMissingError);
  });
});
