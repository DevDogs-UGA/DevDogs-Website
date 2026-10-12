import { describe, expect, it } from "vitest";
import { isFirstPartyClaims } from "./firstParty";

describe("isFirstPartyClaims", () => {
  it("accepts a first-party session token", () => {
    expect(isFirstPartyClaims({ role: "authenticated" })).toBe(true);
  });

  it("refuses an OAuth client's downgraded access token", () => {
    expect(isFirstPartyClaims({ role: "oauth_identity", client_id: "c" })).toBe(
      false,
    );
  });

  it("refuses an access token that carries a client even with the role intact", () => {
    expect(isFirstPartyClaims({ role: "authenticated", client_id: "c" })).toBe(
      false,
    );
  });

  it("refuses an ID token, which has a client and no role", () => {
    expect(isFirstPartyClaims({ client_id: "c" })).toBe(false);
  });

  it("refuses a token with no role", () => {
    expect(isFirstPartyClaims({})).toBe(false);
  });

  it("refuses the other database roles", () => {
    for (const role of ["anon", "service_role", "oauth_identity"]) {
      expect(isFirstPartyClaims({ role })).toBe(false);
    }
  });
});
