import { describe, expect, it } from "vitest";
import {
  checkDiscovery,
  parseIssuer,
  supabaseIssuerLabel,
} from "./issuerCheck";

const good = {
  issuer: "https://devdogsuga.supabase.co/auth/v1",
  authorization_endpoint:
    "https://devdogsuga.supabase.co/auth/v1/oauth/authorize",
  token_endpoint: "https://devdogsuga.supabase.co/auth/v1/oauth/token",
  jwks_uri: "https://devdogsuga.supabase.co/auth/v1/.well-known/jwks.json",
};
const es256 = { keys: [{ kty: "EC", kid: "f83feda1", alg: "ES256" }] };

describe("parseIssuer", () => {
  it("returns the issuer string", () => {
    expect(parseIssuer(good)).toBe(good.issuer);
  });

  it.each([null, {}, { issuer: "" }, { issuer: 3 }])(
    "refuses a document without an issuer (%j)",
    (doc) => {
      expect(() => parseIssuer(doc)).toThrow(/missing an issuer/);
    },
  );
});

describe("supabaseIssuerLabel", () => {
  it("names the project", () => {
    expect(supabaseIssuerLabel(good.issuer)).toBe("devdogsuga");
    expect(
      supabaseIssuerLabel("https://fqpbnmwyopohbhzkpoiu.supabase.co/auth/v1"),
    ).toBe("fqpbnmwyopohbhzkpoiu");
  });

  it.each([
    "https://api.devdogsuga.org/auth/v1",
    "http://127.0.0.1:54321/auth/v1",
    "https://devdogsuga.supabase.co/auth/v1/",
    "https://devdogsuga.supabase.co",
    "https://x.devdogsuga.supabase.co/auth/v1",
  ])("is null for %s", (issuer) => {
    expect(supabaseIssuerLabel(issuer)).toBeNull();
  });
});

describe("checkDiscovery", () => {
  it("passes a Supabase-hosted issuer with asymmetric keys", () => {
    expect(
      checkDiscovery(good, { jwks: es256, expectLabel: "devdogsuga" }),
    ).toEqual({
      ok: true,
      issuer: good.issuer,
      problems: [],
    });
  });

  it("fails when the issuer names another project than expected", () => {
    const result = checkDiscovery(good, {
      expectLabel: "fqpbnmwyopohbhzkpoiu",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toMatch(/expected fqpbnmwyopohbhzkpoiu/);
  });

  it("fails when the issuer is a custom domain, which a provider could not match", () => {
    const result = checkDiscovery({
      ...good,
      issuer: "https://api.devdogsuga.org/auth/v1",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toMatch(
      /not https:\/\/<project>\.supabase\.co/,
    );
  });

  it("fails when dynamic registration is advertised", () => {
    const result = checkDiscovery({
      ...good,
      registration_endpoint:
        "https://devdogsuga.supabase.co/auth/v1/oauth/clients/register",
    });
    expect(result.problems.join()).toMatch(/dynamic registration is on/);
  });

  it("accepts a null registration_endpoint", () => {
    expect(checkDiscovery({ ...good, registration_endpoint: null }).ok).toBe(
      true,
    );
  });

  it("fails on a symmetric signing key", () => {
    const result = checkDiscovery(good, {
      jwks: { keys: [{ kty: "oct", kid: "f382ee75" }] },
    });
    expect(result.problems.join()).toMatch(/f382ee75 is oct/);
  });

  it("fails on missing endpoints", () => {
    const result = checkDiscovery({ issuer: good.issuer });
    expect(result.problems).toHaveLength(3);
  });
});
