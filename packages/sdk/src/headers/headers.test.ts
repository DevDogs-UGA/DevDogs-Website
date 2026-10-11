import { describe, expect, it } from "vitest";
import { baselineCsp } from "./csp.js";
import {
  applySecurityHeaders,
  baselineHeaders,
  buildSecurityHeaders,
  CSP_HEADER,
} from "./headers.js";

const csp = baselineCsp({
  nonce: "test-nonce-value",
  environment: "production",
});

function get(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key === key)?.value;
}

describe("baselineHeaders", () => {
  it("omits Strict-Transport-Security in development (plain HTTP)", () => {
    const headers = baselineHeaders({ environment: "development" });
    expect(get(headers, "Strict-Transport-Security")).toBeUndefined();
  });

  it("sets Strict-Transport-Security in staging and production, without preload", () => {
    for (const environment of ["staging", "production"] as const) {
      const hsts = get(
        baselineHeaders({ environment }),
        "Strict-Transport-Security",
      );
      expect(hsts).toBe("max-age=31536000; includeSubDomains");
      expect(hsts).not.toContain("preload");
    }
  });

  it("always sets nosniff, referrer, framing, and permissions headers", () => {
    const headers = baselineHeaders({ environment: "development" });

    expect(get(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(headers, "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(get(headers, "X-Frame-Options")).toBe("DENY");
    expect(get(headers, "Permissions-Policy")).toContain("camera=()");
    expect(get(headers, "Permissions-Policy")).toContain("microphone=()");
    expect(get(headers, "Permissions-Policy")).toContain("geolocation=()");
  });

  it("carries no CSP of its own", () => {
    expect(
      get(baselineHeaders({ environment: "production" }), CSP_HEADER),
    ).toBeUndefined();
  });
});

describe("buildSecurityHeaders", () => {
  it("sets Content-Security-Policy-Report-Only, and never the enforcing header", () => {
    const headers = buildSecurityHeaders({ environment: "production", csp });

    expect(CSP_HEADER).toBe("Content-Security-Policy-Report-Only");
    expect(get(headers, CSP_HEADER)).toBeTruthy();
    expect(get(headers, "Content-Security-Policy")).toBeUndefined();
  });

  it("serializes the app's directives into the CSP header", () => {
    const headers = buildSecurityHeaders({
      environment: "production",
      csp: { ...csp, "connect-src": ["'self'", "https://api.devdogsuga.org"] },
    });
    const value = get(headers, CSP_HEADER)!;

    expect(value).toContain("connect-src 'self' https://api.devdogsuga.org");
    expect(value).toContain("'nonce-test-nonce-value'");
  });

  it("returns a fresh array each call", () => {
    const a = buildSecurityHeaders({ environment: "production", csp });
    const b = buildSecurityHeaders({ environment: "production", csp });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("applySecurityHeaders", () => {
  it("sets every built header onto the given Headers instance and returns it", () => {
    const headers = new Headers();
    const result = applySecurityHeaders(headers, {
      environment: "production",
      csp,
    });

    expect(result).toBe(headers);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headers.get(CSP_HEADER)).toBeTruthy();
  });

  it("overwrites a pre-existing same-name header rather than duplicating it", () => {
    const headers = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
    applySecurityHeaders(headers, { environment: "development", csp });
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("leaves unrelated headers already on the instance untouched", () => {
    const headers = new Headers({ "Set-Cookie": "sb-session=abc" });
    applySecurityHeaders(headers, { environment: "development", csp });
    expect(headers.get("Set-Cookie")).toBe("sb-session=abc");
  });
});
