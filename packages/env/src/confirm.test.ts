import { describe, expect, it, vi } from "vitest";
import { confirmProduction } from "./confirm.js";

const base = { what: "platform", yes: false, isTTY: true };

describe("confirmProduction", () => {
  it("asks for nothing outside production", async () => {
    const ask = vi.fn<(q: string) => Promise<boolean>>();
    for (const tier of ["development", "staging"]) {
      expect(await confirmProduction({ ...base, tier, ask })).toEqual({
        ok: true,
      });
    }
    expect(ask).not.toHaveBeenCalled();
  });

  it("--yes skips the question", async () => {
    const ask = vi.fn<(q: string) => Promise<boolean>>();
    expect(
      await confirmProduction({ ...base, tier: "production", yes: true, ask }),
    ).toEqual({ ok: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it("refuses without a terminal or --yes", async () => {
    const r = await confirmProduction({
      ...base,
      tier: "production",
      isTTY: false,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("--yes");
  });

  it("follows the answer on a terminal", async () => {
    expect(
      await confirmProduction({
        ...base,
        tier: "production",
        ask: async () => true,
      }),
    ).toEqual({ ok: true });
    expect(
      (
        await confirmProduction({
          ...base,
          tier: "production",
          ask: async () => false,
        })
      ).ok,
    ).toBe(false);
  });
});
