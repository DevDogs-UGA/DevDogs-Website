import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "./fixtures.js";

const { upsertDevDogsProvider } = vi.hoisted(() => ({
  upsertDevDogsProvider: vi.fn(),
}));
vi.mock("../oauth/db.js", () => ({ upsertDevDogsProvider }));
vi.mock("../oauth/discovery.js", () => ({
  fetchIssuerFromAny: () =>
    Promise.resolve({ issuer: "https://ref.supabase.co/auth/v1" }),
}));

import {
  OAuthRegistrationError,
  reRegisterSavedProvider,
  registerProvider,
} from "./oauth.js";

const TARGET = {
  kind: "local" as const,
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgres://x",
  publishableKey: "pk",
  secretKey: "sk",
};

describe("product OAuth credentials", () => {
  beforeEach(() => {
    upsertDevDogsProvider.mockReset();
    upsertDevDogsProvider.mockResolvedValue({
      identifier: "custom:devdogsuga",
      issuer: "https://ref.supabase.co/auth/v1",
    });
  });

  it("saves the client secret in .env.tooling, never in .env.local", async () => {
    const product = makeProduct();
    await registerProvider(product.paths.toolingFile, TARGET, {
      clientId: "id-1",
      clientSecret: "secret-1",
    });
    const saved = readFileSync(product.paths.toolingFile, "utf8");
    expect(saved).toContain("OAUTH_CLIENT_SECRET=secret-1");
    expect(() => readFileSync(join(product.root, ".env.local"))).toThrow();
  });

  it("registers again from what .env.tooling holds", async () => {
    const product = makeProduct({
      files: {
        ".env.tooling": "OAUTH_CLIENT_ID=id-2\nOAUTH_CLIENT_SECRET=secret-2\n",
      },
    });
    await reRegisterSavedProvider(product.paths.toolingFile, TARGET);
    expect(upsertDevDogsProvider).toHaveBeenCalledWith(
      { apiUrl: TARGET.apiUrl, serviceRoleKey: "sk" },
      expect.objectContaining({ clientId: "id-2", clientSecret: "secret-2" }),
    );
  });

  it("says where it looked when nothing is saved", async () => {
    const product = makeProduct();
    await expect(
      reRegisterSavedProvider(product.paths.toolingFile, TARGET),
    ).rejects.toThrow(OAuthRegistrationError);
    await expect(
      reRegisterSavedProvider(product.paths.toolingFile, TARGET),
    ).rejects.toThrow(/\.env\.tooling/);
  });
});
