import { describe, expect, it } from "vitest";
import { psqlEnvironment } from "./commands.js";

describe("psqlEnvironment", () => {
  it("turns the tier's DB_URL into libpq defaults, so the password never reaches a command line", () => {
    const env = psqlEnvironment(
      "postgresql://postgres.abc:p%40ss@aws-0.pooler.supabase.com:6543/postgres",
      { PATH: "/bin" },
    );
    expect(env).toMatchObject({
      PATH: "/bin",
      PGHOST: "aws-0.pooler.supabase.com",
      PGPORT: "6543",
      PGUSER: "postgres.abc",
      PGPASSWORD: "p@ss",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
    });
  });

  it("does not demand TLS from the local stack, and honours an explicit sslmode", () => {
    expect(
      psqlEnvironment(
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        {},
      ).PGSSLMODE,
    ).toBeUndefined();
    expect(
      psqlEnvironment(
        "postgresql://u:p@db.example.com/db?sslmode=verify-full",
        {},
      ).PGSSLMODE,
    ).toBe("verify-full");
  });
});
