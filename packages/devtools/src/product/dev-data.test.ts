import { describe, expect, it, vi } from "vitest";
import {
  DevDataError,
  errorLine,
  runDevData,
  type Member,
  type SqlSession,
} from "./dev-data.js";
import { makeProduct } from "./fixtures.js";
import type { DbTarget } from "./target.js";

const LOCAL: DbTarget = {
  kind: "local",
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  publishableKey: "p",
  secretKey: "s",
};

const MEMBER: Member = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "a@uga.edu",
  lastSignInAt: null,
};

function fakeSession(
  members: Member[] = [MEMBER],
  missingSchemas: string[] = [],
) {
  const ran: { memberId: string; sql: string }[] = [];
  let closed = false;
  const members_ = vi.fn().mockResolvedValue(members);
  const session: SqlSession = {
    members: members_,
    appliedMigrations: () => Promise.resolve([]),
    existingObjects: () => Promise.resolve(new Set<string>()),
    columnTypes: () => Promise.resolve(new Map<string, string>()),
    missingSchemas: vi.fn().mockResolvedValue(missingSchemas),
    memberByRef: vi.fn((ref: string) =>
      Promise.resolve(
        members.find((m) => m.id === ref || m.email === ref) ?? null,
      ),
    ),
    exec: () => Promise.resolve(),
    runAs: (memberId, sql) => {
      ran.push({ memberId, sql });
      return Promise.resolve();
    },
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
  return { session, ran, members: members_, wasClosed: () => closed };
}

describe("runDevData", () => {
  it("runs the product's SQL once, as the most recent DevDogs sign-in", async () => {
    const product = makeProduct();
    const { session, ran, members, wasClosed } = fakeSession();
    const done = await runDevData(product, LOCAL, () => session, {
      provider: "custom:devdogsuga",
    });
    expect(members).toHaveBeenCalledWith("custom:devdogsuga");
    expect(ran).toEqual([
      {
        memberId: MEMBER.id,
        sql: "select current_setting('devtools.member_id');\n",
      },
    ]);
    expect(done?.file).toBe("supabase/dev-data.sql");
    expect(wasClosed()).toBe(true);
  });

  it("seeds for the member named with --member", async () => {
    const product = makeProduct();
    const other: Member = {
      id: "22222222-2222-4222-8222-222222222222",
      email: "b@uga.edu",
      lastSignInAt: null,
    };
    const { session, ran } = fakeSession([MEMBER, other]);
    await runDevData(product, LOCAL, () => session, {
      provider: "p",
      member: "b@uga.edu",
    });
    expect(ran[0]?.memberId).toBe(other.id);
  });

  it("explains that nobody has signed in yet", async () => {
    const { session, ran, wasClosed } = fakeSession([]);
    await expect(
      runDevData(makeProduct(), LOCAL, () => session, { provider: "p" }),
    ).rejects.toThrow(/Nobody has signed in with DevDogs/);
    expect(ran).toEqual([]);
    expect(wasClosed()).toBe(true);
  });

  it("names a --member that does not exist", async () => {
    const { session } = fakeSession();
    await expect(
      runDevData(makeProduct(), LOCAL, () => session, {
        provider: "p",
        member: "ghost@uga.edu",
      }),
    ).rejects.toThrow(/No user matches ghost@uga\.edu/);
  });

  it("never runs against the product's production project", async () => {
    const open = vi.fn();
    const prod: DbTarget = {
      ...LOCAL,
      kind: "hosted",
      apiUrl: "https://dogpack.supabase.co",
    };
    await expect(
      runDevData(makeProduct(), prod, open, { provider: "p" }),
    ).rejects.toBeInstanceOf(DevDataError);
    expect(open).not.toHaveBeenCalled();
  });

  it("changes nothing in a dry run", async () => {
    const { session, ran } = fakeSession();
    const lines: string[] = [];
    const done = await runDevData(makeProduct(), LOCAL, () => session, {
      provider: "p",
      dryRun: true,
      log: (l) => lines.push(l),
    });
    expect(done).toBeNull();
    expect(ran).toEqual([]);
    expect(lines.join("\n")).toContain("Would run supabase/dev-data.sql");
  });

  it("explains a product with no dev data", async () => {
    const product = makeProduct();
    const without = {
      ...product,
      config: { ...product.config, devData: undefined },
    };
    await expect(
      runDevData(without, LOCAL, () => fakeSession().session, {
        provider: "p",
      }),
    ).rejects.toThrow(/has no dev data/);
  });
});

describe("a database without the schema", () => {
  it("is caught before the file runs, naming the missing schema and what to run", async () => {
    const { session, ran, wasClosed } = fakeSession([MEMBER], ["dogpack"]);
    const failure = runDevData(makeProduct(), LOCAL, () => session, {
      provider: "p",
    });
    await expect(failure).rejects.toBeInstanceOf(DevDataError);
    await expect(failure).rejects.toThrow(/missing: dogpack/);
    await expect(failure).rejects.toThrow(/devtools setup/);
    await expect(failure).rejects.toThrow(/devtools db sync/);
    expect(ran).toEqual([]);
    expect(wasClosed()).toBe(true);
  });
});

describe("an error from the product's own dev-data.sql", () => {
  const sqlError = (code: string, position?: string) =>
    Object.assign(new Error('relation "dogpack.sesions" does not exist'), {
      code,
      position,
    });

  it("is an expected DevDataError with the Postgres message, file and line, even for 42P01", async () => {
    const product = makeProduct({
      files: {
        "supabase/dev-data.sql":
          "select 1;\nselect 2;\ninsert into dogpack.sesions values (1);\n",
      },
    });
    const { session, wasClosed } = fakeSession();
    // Position 22 is on the third line.
    session.runAs = () => Promise.reject(sqlError("42P01", "22"));
    const failure = runDevData(product, LOCAL, () => session, {
      provider: "p",
    });
    await expect(failure).rejects.toBeInstanceOf(DevDataError);
    await expect(failure).rejects.toThrow(
      /supabase\/dev-data\.sql:3: relation "dogpack\.sesions" does not exist/,
    );
    await expect(failure).rejects.not.toThrow(/devtools setup/);
    await expect(failure).rejects.toMatchObject({ expected: true });
    expect(wasClosed()).toBe(true);
  });

  it("names the file alone when Postgres gives no position", async () => {
    const { session } = fakeSession();
    session.runAs = () => Promise.reject(sqlError("23505"));
    await expect(
      runDevData(makeProduct(), LOCAL, () => session, { provider: "p" }),
    ).rejects.toThrow(/^supabase\/dev-data\.sql: /);
  });

  it("leaves a connection failure alone, since that is not the file's fault", async () => {
    const { session } = fakeSession();
    session.runAs = () =>
      Promise.reject(
        Object.assign(new Error("refused"), { code: "ECONNREFUSED" }),
      );
    await expect(
      runDevData(makeProduct(), LOCAL, () => session, { provider: "p" }),
    ).rejects.not.toBeInstanceOf(DevDataError);
  });
});

describe("which database errors are blamed on the product's SQL", () => {
  const withCode = (code: string) => Object.assign(new Error("boom"), { code });

  it.each(["42601", "42P01", "22P02", "23505", "21000"])(
    "%s (syntax, data, integrity, cardinality) is expected",
    async (code) => {
      const { session } = fakeSession();
      session.runAs = () => Promise.reject(withCode(code));
      await expect(
        runDevData(makeProduct(), LOCAL, () => session, { provider: "p" }),
      ).rejects.toMatchObject({ expected: true });
    },
  );

  it.each([
    "08006", // connection failure
    "08001",
    "57P01", // admin shutdown
    "57014", // query canceled
    "53300", // too many connections
    "40001", // serialization failure
    "28P01", // invalid password
    "ECONNRESET",
  ])("%s reports normally", async (code) => {
    const { session } = fakeSession();
    session.runAs = () => Promise.reject(withCode(code));
    const failure = runDevData(makeProduct(), LOCAL, () => session, {
      provider: "p",
    });
    await expect(failure).rejects.not.toBeInstanceOf(DevDataError);
    await expect(failure).rejects.toThrow("boom");
  });

  it("an error before the file runs (finding the member) is not blamed on it", async () => {
    const { session } = fakeSession();
    session.members = () => Promise.reject(withCode("42P01"));
    const failure = runDevData(makeProduct(), LOCAL, () => session, {
      provider: "p",
    });
    await expect(failure).rejects.not.toBeInstanceOf(DevDataError);
  });
});

describe("errorLine", () => {
  it("counts lines up to the 1-based position", () => {
    expect(errorLine({ position: "1" }, "a\nb")).toBe(1);
    expect(errorLine({ position: "3" }, "a\nb")).toBe(2);
    expect(errorLine({}, "a")).toBeNull();
    expect(errorLine({ position: "99" }, "a")).toBeNull();
  });
});
