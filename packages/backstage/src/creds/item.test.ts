import { describe, expect, it } from "vitest";
import {
  MASK,
  parseItem,
  previewBody,
  sendBody,
  sendStatus,
  withFields,
  type BwItem,
} from "./item.js";
import { REDACTED, scrub } from "./secrets.js";

const PASSWORD = "hunter2-correct-horse";

function raw(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: "item-1",
    organizationId: "org",
    collectionIds: ["col"],
    name: "Canva",
    notes: "Use the team workspace.\nNot the personal one.",
    type: 1,
    login: {
      username: "devdogs@uga.edu",
      password: PASSWORD,
      totp: null,
      uris: [{ uri: "https://canva.com/login" }],
    },
    fields: [
      { name: "Recipients", value: "A@uga.edu, b@uga.edu", type: 0 },
      { name: "Owner", value: "Sloan", type: 0 },
      { name: "Send ID", value: "send-1", type: 0 },
      { name: "Send expires", value: "2026-10-31T00:00:00.000Z", type: 0 },
      { name: "Unrelated", value: "kept", type: 0 },
    ],
    ...overrides,
  };
}

describe("a shared item", () => {
  it("reads its access record from the custom fields", () => {
    const item = parseItem(raw());
    expect(item.recipients).toEqual(["a@uga.edu", "b@uga.edu"]);
    expect(item.owner).toBe("Sloan");
    expect(item.send?.id).toBe("send-1");
    expect(item.username).toBe("devdogs@uga.edu");
    expect(item.url).toBe("https://canva.com/login");
  });

  it("registers the password the moment it is read", () => {
    parseItem(raw());
    expect(scrub(`oops ${PASSWORD}`)).toBe(`oops ${REDACTED}`);
  });

  it("previews with a fixed mask and no notes, and sends the real thing", () => {
    const item = parseItem(raw());
    const preview = previewBody(item);
    expect(preview).toContain(`Password: ${MASK}`);
    expect(preview).not.toContain(PASSWORD);
    expect(preview).not.toContain("team workspace");
    expect(preview).toContain("notes: 2 lines, not shown");
    expect(sendBody(item)).toContain(`Password: ${PASSWORD}`);
    expect(sendBody(item)).toContain("Use the team workspace.");
  });

  it("sets its own fields and leaves every other one alone", () => {
    const updated = withFields(raw(), {
      recipients: "c@uga.edu",
      sendLink: "https://send.bitwarden.com/#x/y",
      sendId: undefined,
    });
    expect(updated.fields).toEqual([
      { name: "Recipients", value: "c@uga.edu", type: 0 },
      { name: "Owner", value: "Sloan", type: 0 },
      { name: "Send expires", value: "2026-10-31T00:00:00.000Z", type: 0 },
      { name: "Unrelated", value: "kept", type: 0 },
      { name: "Send link", value: "https://send.bitwarden.com/#x/y", type: 0 },
    ]);
    expect(updated.login?.password).toBe(PASSWORD);
  });

  it("is Expires Soon within 7 days, Expired after", () => {
    const item = parseItem(raw());
    expect(sendStatus(item, new Date("2026-10-10T00:00:00Z"))).toBe("Active");
    expect(sendStatus(item, new Date("2026-10-24T00:00:00Z"))).toBe(
      "Expires Soon",
    );
    expect(sendStatus(item, new Date("2026-11-01T00:00:00Z"))).toBe("Expired");
    expect(sendStatus(parseItem(raw({ fields: [] })), new Date())).toBe(
      "No Send",
    );
  });
});
