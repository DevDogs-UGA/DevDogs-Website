import { describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";

const createBrowserClientMock = vi.fn((..._args: unknown[]) => ({
  __kind: "browser",
}));
const createServerClientMock = vi.fn((..._args: unknown[]) => ({
  __kind: "server",
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => createBrowserClientMock(...args),
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

const { createBrowserClient, createServerClient } = await import("./index.js");

/**
 * A minimal sample `Database` shape — enough to exercise `DatabaseSchema<D>`
 * and prove the generics compile the way a consumer's generated
 * `database.types.ts` would. Not imported for its values; only its type.
 */
interface SampleDatabase {
  __InternalSupabase: { PostgrestVersion: "12" };
  platform: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  reports: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

describe("createBrowserClient", () => {
  it("passes url, key and wraps schema under db.schema", () => {
    const client = createBrowserClient<SampleDatabase, "platform">({
      url: "https://example.supabase.co",
      key: "anon-key",
      schema: "platform",
    });

    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { db: { schema: "platform" } },
    );
    expect(client).toEqual({ __kind: "browser" });
  });

  it("scopes to whichever schema key of Database is supplied", () => {
    createBrowserClient<SampleDatabase, "reports">({
      url: "https://example.supabase.co",
      key: "anon-key",
      schema: "reports",
    });

    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { db: { schema: "reports" } },
    );
  });
});

describe("createServerClient", () => {
  it("passes url, key, schema and wires the caller's cookie adapter through", () => {
    const cookies: CookieMethodsServer = {
      getAll: () => [],
      setAll: () => undefined,
    };

    const client = createServerClient<SampleDatabase, "platform">({
      url: "https://example.supabase.co",
      key: "anon-key",
      schema: "platform",
      cookies,
    });

    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { db: { schema: "platform" }, cookies },
    );
    expect(client).toEqual({ __kind: "server" });
  });
});
