import { afterEach, describe, expect, it, vi } from "vitest";
import { gateHostedTier, isHostedTier } from "./safety-gate.js";

const base = {
  projectRef: "abcdefghijklmnopqrst",
  argv: ["supabase", "db", "push"],
  yes: false,
  nonInteractive: false,
  env: {},
};

afterEach(() => vi.restoreAllMocks());

describe("gateHostedTier", () => {
  it("never asks for development, local or remote", async () => {
    const ask = vi.fn();
    const out = await gateHostedTier({ ...base, tier: "development", ask });
    expect(out).toEqual({ proceed: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks once for production, naming the ref and defaulting to the caller's answer", async () => {
    const ask = vi.fn(async () => true);
    const out = await gateHostedTier({ ...base, tier: "production", ask });
    expect(out).toEqual({ proceed: true });
    expect(ask).toHaveBeenCalledOnce();
    const message = (ask.mock.calls[0] as unknown as [string])[0];
    expect(message).toContain("PRODUCTION");
    expect(message).toContain("abcdefghijklmnopqrst");
  });

  it("uses milder wording for staging", async () => {
    const ask = vi.fn(async () => true);
    await gateHostedTier({ ...base, tier: "staging", ask });
    const message = (ask.mock.calls[0] as unknown as [string])[0];
    expect(message).toContain("staging");
    expect(message).not.toContain("PRODUCTION");
  });

  it("stops when the answer is no", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const out = await gateHostedTier({
      ...base,
      tier: "production",
      ask: async () => false,
    });
    expect(out).toEqual({ proceed: false, reason: "declined" });
  });

  it("refuses a non-interactive run without --yes, without prompting", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const ask = vi.fn();
    const out = await gateHostedTier({
      ...base,
      tier: "production",
      nonInteractive: true,
      ask,
    });
    expect(out).toEqual({ proceed: false, reason: "refused" });
    expect(ask).not.toHaveBeenCalled();
    expect(String(write.mock.calls[0]![0])).toContain("--yes");
  });

  it("lets --yes through without prompting", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const ask = vi.fn();
    const out = await gateHostedTier({
      ...base,
      tier: "production",
      yes: true,
      nonInteractive: true,
      ask,
    });
    expect(out).toEqual({ proceed: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it("does not ask again inside a nested run that already passed", async () => {
    const ask = vi.fn();
    const out = await gateHostedTier({
      ...base,
      tier: "production",
      env: { DEVTOOLS_GATE_PASSED: "production" },
      ask,
    });
    expect(out).toEqual({ proceed: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it("never prints a database URL", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const ask = vi.fn(async () => true);
    await gateHostedTier({
      ...base,
      tier: "production",
      argv: ["supabase", "db", "push", "--db-url", "postgres://u:secret@h/db"],
      ask,
    });
    const message = (ask.mock.calls[0] as unknown as [string])[0];
    expect(message).not.toContain("secret");
  });
});

describe("isHostedTier", () => {
  it("is staging and production only", () => {
    expect(["development", "staging", "production"].map(isHostedTier)).toEqual([
      false,
      true,
      true,
    ]);
  });
});
