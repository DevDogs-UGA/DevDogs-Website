import { describe, expect, it } from "vitest";
import { validateSessionPoolerUrl } from "./pooler.js";

describe("validateSessionPoolerUrl", () => {
  it("accepts a Session pooler string", () => {
    const result = validateSessionPoolerUrl(
      "postgresql://postgres.abcxyz:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a URL-encoded password with special characters", () => {
    const result = validateSessionPoolerUrl(
      "postgresql://postgres.abcxyz:p%40ss%23w%3Ard@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects the direct connection host", () => {
    const result = validateSessionPoolerUrl(
      "postgresql://postgres:pw@db.abcxyz.supabase.co:5432/postgres",
    );
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("direct-connection");
    expect(result.faqId).toBe("db-url-direct-connection");
  });

  it("rejects the Transaction pooler port", () => {
    const result = validateSessionPoolerUrl(
      "postgresql://postgres.abcxyz:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("transaction-pooler");
    expect(result.faqId).toBe("db-url-transaction-pooler");
  });

  it("rejects garbage", () => {
    const result = validateSessionPoolerUrl("not a url");
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("invalid");
  });
});
