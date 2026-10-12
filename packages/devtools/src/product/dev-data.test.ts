import { describe, expect, it, vi } from "vitest";
import {
  DevDataError,
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

function fakeSession(members: Member[] = [MEMBER]) {
  const ran: { memberId: string; sql: string }[] = [];
  let closed = false;
  const members_ = vi.fn().mockResolvedValue(members);
  const session: SqlSession = {
    members: members_,
    memberByRef: vi.fn((ref: string) =>
      Promise.resolve(
        members.find((m) => m.id === ref || m.email === ref) ?? null,
      ),
    ),
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
