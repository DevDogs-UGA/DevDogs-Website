import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  codeChallengeFor,
  generateCodeVerifier,
  generateState,
} from "./pkce.js";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("generateCodeVerifier", () => {
  it("returns a base64url string with no padding", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(BASE64URL);
    expect(verifier).not.toContain("=");
  });

  it("is different every call", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("codeChallengeFor", () => {
  it("computes BASE64URL(SHA256(verifier))", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(codeChallengeFor(verifier)).toBe(expected);
  });

  it("is deterministic for the same verifier", () => {
    const verifier = generateCodeVerifier();
    expect(codeChallengeFor(verifier)).toBe(codeChallengeFor(verifier));
  });
});

describe("generateState", () => {
  it("returns a base64url string with no padding", () => {
    const state = generateState();
    expect(state).toMatch(BASE64URL);
    expect(state).not.toContain("=");
  });

  it("is different every call", () => {
    expect(generateState()).not.toBe(generateState());
  });
});
