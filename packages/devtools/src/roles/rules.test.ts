import { describe, expect, it } from "vitest";
import {
  findAccount,
  findRole,
  PRESIDENT_ROLE_ID,
  planGrant,
  planRevoke,
  type Account,
  type RoleRow,
} from "./rules.js";

const president: RoleRow = {
  id: PRESIDENT_ROLE_ID,
  title: "President",
  roleType: "custom",
  rank: 100,
  discordRoleId: null,
};
const lead: RoleRow = {
  ...president,
  id: "lead",
  title: "Focus Lead",
  rank: 5,
};
const synced: RoleRow = { ...lead, id: "synced", discordRoleId: "123" };
const member: RoleRow = {
  ...lead,
  id: "member",
  title: "Member",
  roleType: "default",
  rank: null,
};
const ada: Account = { userId: "a", email: "Ada@uga.edu" };
const bob: Account = { userId: "b", email: "bob@uga.edu" };

describe("lookups", () => {
  it("finds a role by title in any case, or by id", () => {
    expect(findRole([president, lead], "focus lead")).toBe(lead);
    expect(findRole([president, lead], PRESIDENT_ROLE_ID)).toBe(president);
    expect(findRole([president], "nope")).toBeUndefined();
  });

  it("finds an account by email in any case", () => {
    expect(findAccount([ada, bob], "ada@UGA.edu")).toBe(ada);
  });
});

describe("planGrant", () => {
  it("grants an ordinary role", () => {
    expect(planGrant(lead, ada, [])).toEqual({ kind: "grant" });
  });

  it("notices a role already held", () => {
    expect(planGrant(lead, ada, [ada])).toEqual({ kind: "already" });
  });

  it("transfers President from its current holder", () => {
    expect(planGrant(president, ada, [bob])).toEqual({
      kind: "transfer",
      from: bob,
    });
  });

  it("grants President straight away when nobody holds it", () => {
    expect(planGrant(president, ada, [])).toEqual({ kind: "grant" });
  });

  it("refuses Member and Discord-synced roles", () => {
    expect(planGrant(member, ada, [])).toMatchObject({ kind: "refused" });
    const plan = planGrant(synced, ada, []);
    expect(plan).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(plan)).toContain("managed by Discord");
  });
});

describe("planRevoke", () => {
  it("revokes a held role", () => {
    expect(planRevoke(lead, ada, [ada])).toEqual({ kind: "revoke" });
  });

  it("says when the role was not held", () => {
    expect(planRevoke(lead, ada, [bob])).toEqual({ kind: "not-held" });
  });

  it("refuses Member and Discord-synced roles", () => {
    expect(planRevoke(member, ada, [ada])).toMatchObject({ kind: "refused" });
    expect(planRevoke(synced, ada, [ada])).toMatchObject({ kind: "refused" });
  });
});
