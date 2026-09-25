import { afterEach, describe, expect, it, vi } from "vitest";

const getProvider = vi.fn();
const createProvider = vi.fn();
const updateProvider = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        customProviders: {
          getProvider: (...args: unknown[]) => getProvider(...args),
          createProvider: (...args: unknown[]) => createProvider(...args),
          updateProvider: (...args: unknown[]) => updateProvider(...args),
        },
      },
    },
  })),
}));

const { checkProvider, upsertDevDogsProvider } = await import("./db.js");

// A hosted target's admin credentials — same shape a local target's are,
// proof this is the SAME code path `wizard.ts` reaches for either kind (see
// `target.ts`'s `ConnectTarget`, which both resolve to a plain
// `{ apiUrl, serviceRoleKey }` before reaching here).
const HOSTED_TARGET = {
  apiUrl: "https://staging-ref.supabase.co",
  serviceRoleKey: "hosted-service-role-key",
};

describe("checkProvider — against a mocked Admin API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports exists: false on a 404", async () => {
    getProvider.mockResolvedValue({ data: null, error: { status: 404 } });

    const result = await checkProvider(HOSTED_TARGET, "custom:devdogsuga");

    expect(result).toEqual({ exists: false, name: undefined, issuer: undefined });
    expect(getProvider).toHaveBeenCalledWith("custom:devdogsuga");
  });

  it("reports the existing provider's name and issuer", async () => {
    getProvider.mockResolvedValue({
      data: { name: "DevDogs", issuer: "https://ref.supabase.co/auth/v1" },
      error: null,
    });

    const result = await checkProvider(HOSTED_TARGET, "custom:devdogsuga");

    expect(result).toEqual({
      exists: true,
      name: "DevDogs",
      issuer: "https://ref.supabase.co/auth/v1",
    });
  });

  it("rethrows a non-404 error", async () => {
    getProvider.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });

    await expect(checkProvider(HOSTED_TARGET, "custom:devdogsuga")).rejects.toEqual({
      status: 500,
      message: "boom",
    });
  });
});

describe("upsertDevDogsProvider — against a mocked Admin API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const opts = {
    identifier: "custom:devdogsuga",
    name: "DevDogs",
    clientId: "cid",
    clientSecret: "csecret",
    issuer: "https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1",
  };

  it("creates the provider when none exists, against a hosted target", async () => {
    getProvider.mockResolvedValue({ data: null, error: { status: 404 } });
    createProvider.mockResolvedValue({
      data: { identifier: "custom:devdogsuga", issuer: opts.issuer },
      error: null,
    });

    const result = await upsertDevDogsProvider(HOSTED_TARGET, opts);

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: "oidc",
        identifier: "custom:devdogsuga",
        client_id: "cid",
        client_secret: "csecret",
        issuer: opts.issuer,
        enabled: true,
      }),
    );
    expect(updateProvider).not.toHaveBeenCalled();
    expect(result).toEqual({ identifier: "custom:devdogsuga", issuer: opts.issuer });
  });

  it("updates the provider when one already exists", async () => {
    getProvider.mockResolvedValue({
      data: { identifier: "custom:devdogsuga", issuer: "https://old-issuer" },
      error: null,
    });
    updateProvider.mockResolvedValue({
      data: { identifier: "custom:devdogsuga", issuer: opts.issuer },
      error: null,
    });

    const result = await upsertDevDogsProvider(HOSTED_TARGET, opts);

    expect(updateProvider).toHaveBeenCalledWith(
      "custom:devdogsuga",
      expect.objectContaining({
        client_id: "cid",
        client_secret: "csecret",
        issuer: opts.issuer,
        enabled: true,
      }),
    );
    expect(createProvider).not.toHaveBeenCalled();
    expect(result).toEqual({ identifier: "custom:devdogsuga", issuer: opts.issuer });
  });

  it("propagates a createProvider error", async () => {
    getProvider.mockResolvedValue({ data: null, error: { status: 404 } });
    createProvider.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });

    await expect(upsertDevDogsProvider(HOSTED_TARGET, opts)).rejects.toEqual({
      message: "quota exceeded",
    });
  });
});
