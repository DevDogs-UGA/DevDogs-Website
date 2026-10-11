import { afterEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn((..._args: unknown[]) => ({ __kind: "admin" }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const drizzleMock = vi.fn((..._args: unknown[]) => ({ __kind: "drizzle" }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: (...args: unknown[]) => drizzleMock(...args),
}));

const postgresMock = vi.fn((url: string, options: unknown) => ({
  __kind: "postgres",
  url,
  options,
}));
vi.mock("postgres", () => ({
  default: (...args: [string, unknown]) => postgresMock(...args),
}));

const { createAdminClient, createDb } = await import("./index.js");

interface SampleDatabase {
  __InternalSupabase: { PostgrestVersion: "12" };
  platform: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

describe("createAdminClient", () => {
  afterEach(() => {
    createClientMock.mockClear();
  });

  it("uses the service key with RLS-bypassing auth disabled", () => {
    const client = createAdminClient<SampleDatabase, "platform">({
      url: "https://example.supabase.co",
      key: "service-role-key",
      schema: "platform",
    });

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      {
        db: { schema: "platform" },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    expect(client).toEqual({ __kind: "admin" });
  });
});

describe("createDb", () => {
  afterEach(() => {
    postgresMock.mockClear();
    drizzleMock.mockClear();
    vi.unstubAllEnvs();
  });

  const relations = { __kind: "relations" } as never;

  it("builds a drizzle client from a postgres-js connection, without connecting", () => {
    vi.stubEnv("NODE_ENV", "production");

    const db = createDb("postgres://example/one", relations, { cache: false });

    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://example/one",
      expect.objectContaining({ prepare: false, idle_timeout: 20 }),
    );
    expect(postgresMock).toHaveBeenCalledTimes(1);
    const postgresClient: unknown = postgresMock.mock.results[0]?.value;
    expect(drizzleMock).toHaveBeenCalledWith({
      client: postgresClient,
      relations,
    });
    expect(db).toEqual({ __kind: "drizzle" });
  });

  it("applies a caller-supplied max on top of the shared connection options", () => {
    vi.stubEnv("NODE_ENV", "production");

    createDb("postgres://example/two", relations, { cache: false, max: 5 });

    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://example/two",
      expect.objectContaining({ prepare: false, idle_timeout: 20, max: 5 }),
    );
  });

  it("caches the connection per URL outside production by default", () => {
    vi.stubEnv("NODE_ENV", "development");

    createDb("postgres://example/cached", relations);
    createDb("postgres://example/cached", relations);

    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");

    createDb("postgres://example/prod", relations);
    createDb("postgres://example/prod", relations);

    expect(postgresMock).toHaveBeenCalledTimes(2);
  });

  it("skips the cache entirely when cache: false is passed, even outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    createDb("postgres://example/no-cache", relations, { cache: false });
    createDb("postgres://example/no-cache", relations, { cache: false });

    expect(postgresMock).toHaveBeenCalledTimes(2);
  });
});
