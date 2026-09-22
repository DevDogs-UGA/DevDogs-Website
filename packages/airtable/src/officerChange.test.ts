import { describe, expect, it } from "vitest";
import {
  createOfficerChangeGrammar,
  InvalidOfficerChangeError,
  officerChangeDigest,
  rawOfficerChangeDigest,
  type MemberIdentityResolver,
} from "./officerChange.js";
import { officerChangesTable } from "./registry.js";

const ID = "10000000-0000-4000-a000-000000000001";

/**
 * Inlined from the platform engine's `memberIdentity.ts`, which is where this
 * rule lives for real. It is a fixture here, not a re-implementation: the
 * package must not grow an opinion about what a member identifier is.
 */
const UGA_DOMAIN = "@uga.edu";
const myIdToEmail: MemberIdentityResolver = (raw) => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  const local = value.endsWith(UGA_DOMAIN)
    ? value.slice(0, -UGA_DOMAIN.length)
    : value;
  if (!/^[a-z0-9._-]+$/.test(local)) return null;
  return `${local}${UGA_DOMAIN}`;
};

const {
  normalizeOfficerChange,
  parseOfficerChangeRecord,
  parseOfficerChangeActor,
} = createOfficerChangeGrammar({ resolveMemberIdentity: myIdToEmail });

describe("normalizeOfficerChange", () => {
  it("normalizes a MyID in an attendance addition", () => {
    expect(
      normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId: ID,
        member: "  AbC123  ",
        reason: "Missed paper roster",
      }),
    ).toMatchObject({ member: "abc123@uga.edu" });
  });

  it("rejects a non-UGA member address", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId: ID,
        member: "member@gmail.com",
        reason: "Correction",
      }),
    ).toThrow(InvalidOfficerChangeError);
  });

  it("requires a reflection edit to change something", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "reflection",
        action: "edit",
        reflectionId: ID,
        reason: "Correction",
      }),
    ).toThrow(/at least one field/);
  });

  it("does not allow two activity assignments", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "reflection",
        action: "edit",
        reflectionId: ID,
        meetingId: ID,
        competitionId: "20000000-0000-4000-a000-000000000002",
        reason: "Correction",
      }),
    ).toThrow(/only one activity/);
  });

  it("accepts every participation override decision", () => {
    for (const action of ["grant", "revoke", "clear"] as const) {
      expect(
        normalizeOfficerChange({
          kind: "competition_participation",
          action,
          teamId: ID,
          reason: "Judging roster correction",
        }),
      ).toMatchObject({ action });
    }
  });
});

describe("parseOfficerChangeRecord", () => {
  it("maps field IDs and an explicit Draft state", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Officer correction",
          [fields.reflectionState.id]: "Draft",
        },
      }),
    ).toEqual({
      kind: "reflection",
      action: "edit",
      reflectionId: ID,
      reason: "Officer correction",
      submitted: false,
    });
  });

  it("maps the explicit clear-content checkbox to an empty body", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Remove content at the member's request",
          [fields.clearReflectionContent.id]: true,
        },
      }),
    ).toMatchObject({ content: "" });
  });

  it("rejects replacement content together with the clear checkbox", () => {
    const fields = officerChangesTable.fields;
    expect(() =>
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Conflicting correction",
          [fields.reflectionContent.id]: "Replacement",
          [fields.clearReflectionContent.id]: true,
        },
      }),
    ).toThrow(/not both/);
  });
});

describe("parseOfficerChangeActor", () => {
  it("requires and normalizes Airtable's immutable Created by value", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeActor({
        id: "recCommand",
        fields: {
          [fields.createdBy.id]: {
            id: "usrOfficer",
            email: "OFFICER@UGA.EDU",
            name: " Officer Name ",
          },
        },
      }),
    ).toEqual({
      airtableUserId: "usrOfficer",
      email: "officer@uga.edu",
      displayName: "Officer Name",
    });
  });
});

describe("officerChangeDigest", () => {
  it("is stable after normalization and changes with the command", async () => {
    const first = normalizeOfficerChange({
      kind: "attendance",
      action: "add",
      meetingId: ID,
      member: "ABC123",
      reason: "Correction",
    });
    const equivalent = normalizeOfficerChange({
      kind: "attendance",
      action: "add",
      meetingId: ID,
      member: "abc123@uga.edu",
      reason: "Correction",
    });
    const changed = normalizeOfficerChange({
      ...equivalent,
      reason: "Different correction",
    });

    await expect(officerChangeDigest(first)).resolves.toBe(
      await officerChangeDigest(equivalent),
    );
    await expect(officerChangeDigest(changed)).resolves.not.toBe(
      await officerChangeDigest(first),
    );
  });

  it("pins invalid form fields without depending on object key order", async () => {
    const createdBy = officerChangesTable.fields.createdBy.id;
    const first = {
      id: "recCommand",
      fields: {
        [createdBy]: { id: "usrOfficer", email: "officer@uga.edu" },
      },
    };
    const equivalent = {
      id: "recCommand",
      fields: {
        [createdBy]: { email: "officer@uga.edu", id: "usrOfficer" },
      },
    };

    await expect(rawOfficerChangeDigest(first)).resolves.toBe(
      await rawOfficerChangeDigest(equivalent),
    );
  });
});

/**
 * The seam itself. These cases did not exist in platform, where identity was
 * an import: they exist to prove the package holds no identity policy of its
 * own and that both resolution points are reachable.
 */
describe("identity parameterization", () => {
  const passthrough = createOfficerChangeGrammar({
    resolveMemberIdentity: (raw) => raw?.trim().toLowerCase() || null,
  });

  it("uses the caller's resolver for the member identifier", () => {
    expect(
      passthrough.normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId: ID,
        member: " Member@Gmail.com ",
        reason: "Correction",
      }),
    ).toMatchObject({ member: "member@gmail.com" });
  });

  it("falls back to the member resolver for the submitter", () => {
    expect(
      passthrough.parseOfficerChangeActor({
        id: "recCommand",
        fields: {
          [officerChangesTable.fields.createdBy.id]: {
            id: "usrOfficer",
            email: "Officer@Example.org",
          },
        },
      }),
    ).toEqual({
      airtableUserId: "usrOfficer",
      email: "officer@example.org",
      displayName: null,
    });
  });

  it("lets the submitter be resolved separately from the subject", () => {
    const split = createOfficerChangeGrammar({
      resolveMemberIdentity: myIdToEmail,
      resolveActorEmail: (raw) =>
        raw === "robot@example.org" ? "robot@example.org" : null,
    });

    expect(
      split.parseOfficerChangeActor({
        id: "recCommand",
        fields: {
          [officerChangesTable.fields.createdBy.id]: {
            id: "usrRobot",
            email: "robot@example.org",
          },
        },
      }),
    ).toMatchObject({ email: "robot@example.org" });

    expect(() =>
      split.parseOfficerChangeActor({
        id: "recCommand",
        fields: {
          [officerChangesTable.fields.createdBy.id]: {
            id: "usrOfficer",
            email: "officer@uga.edu",
          },
        },
      }),
    ).toThrow(InvalidOfficerChangeError);
  });

  it("refuses a record with no attributable submitter", () => {
    expect(() =>
      parseOfficerChangeActor({ id: "recCommand", fields: {} }),
    ).toThrow(/no attributable Airtable submitter/);
  });
});
