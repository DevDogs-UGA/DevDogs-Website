import { describe, expect, it } from "vitest";
import {
  checkRecipients,
  emailsForRoles,
  findRole,
  resolveRosterDbUrl,
  rosterFromRows,
  type RosterRow,
} from "./roster.js";

const ROWS: RosterRow[] = [
  {
    userId: "u1",
    name: "Sloan Finger",
    ugaEmail: "SF12345@uga.edu",
    authEmail: "sloan@example.com",
    roles: ["DevOps Director", "Project Manager"],
    ranks: [300, 700],
  },
  {
    userId: "u2",
    name: "Pat President",
    ugaEmail: null,
    authEmail: "pp11111@uga.edu",
    roles: ["President"],
    ranks: [100],
  },
  {
    userId: "u3",
    name: "Camila Campus",
    ugaEmail: "cc22222@uga.edu",
    authEmail: null,
    roles: ["Campus Engagement Team"],
    ranks: [500],
  },
  {
    userId: "u4",
    name: "No Uga",
    ugaEmail: null,
    authEmail: "personal@gmail.com",
    roles: ["Project Manager"],
    ranks: [700],
  },
];

describe("the roster", () => {
  const { roster, skipped } = rosterFromRows(ROWS);

  it("uses the profile's UGA address, then a UGA sign-in address, lowercased", () => {
    expect(roster.officers.map((o) => o.email)).toEqual([
      "cc22222@uga.edu",
      "pp11111@uga.edu",
      "sf12345@uga.edu",
    ]);
  });

  it("sets aside anyone with no UGA address, by name", () => {
    expect(skipped).toEqual(["No Uga"]);
  });

  it("orders roles by rank, President first", () => {
    expect(roster.roles.map((r) => r.title)).toEqual([
      "President",
      "DevOps Director",
      "Campus Engagement Team",
      "Project Manager",
    ]);
  });

  it("finds a role by exact title or a unique prefix, any case", () => {
    expect(findRole(roster, "president").title).toBe("President");
    expect(findRole(roster, "devops").title).toBe("DevOps Director");
    expect(() => findRole(roster, "treasurer")).toThrow(/No officer role/);
  });

  it("picks everyone in a role, once each", () => {
    expect(
      emailsForRoles(roster, ["DevOps Director", "Project Manager"]),
    ).toEqual(["sf12345@uga.edu"]);
  });

  it("refuses addresses off the roster unless allowed", () => {
    expect(
      checkRecipients(["PP11111@uga.edu", "x@uga.edu"], roster, false),
    ).toEqual({ accepted: ["pp11111@uga.edu"], refused: ["x@uga.edu"] });
    expect(checkRecipients(["x@uga.edu"], roster, true)).toEqual({
      accepted: ["x@uga.edu"],
      refused: [],
    });
  });
});

describe("the production connection", () => {
  it("prefers --db-url, then the checkout, then Secrets Manager", async () => {
    const never = () => Promise.reject(new Error("should not be asked"));
    expect(
      await resolveRosterDbUrl({
        explicit: "postgres://flag",
        fromCheckout: never,
        fromSecretsManager: never,
      }),
    ).toBe("postgres://flag");
    expect(
      await resolveRosterDbUrl({
        fromCheckout: async () => "postgres://file",
        fromSecretsManager: never,
      }),
    ).toBe("postgres://file");
    expect(
      await resolveRosterDbUrl({
        fromCheckout: async () => undefined,
        fromSecretsManager: async () => "postgres://bws",
      }),
    ).toBe("postgres://bws");
  });

  it("says what to do when there is none", async () => {
    await expect(
      resolveRosterDbUrl({
        fromCheckout: async () => undefined,
        fromSecretsManager: async () => undefined,
      }),
    ).rejects.toThrow(/--db-url/);
  });
});
