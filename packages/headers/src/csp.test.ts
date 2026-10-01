import { describe, expect, it } from "vitest";
import { baselineCsp, originOf, serializeCsp } from "./csp.js";
import { SHARED_ORIGINS } from "./origins.js";

const base = { nonce: "test-nonce-value", environment: "production" } as const;

describe("baselineCsp", () => {
  it("denies framing and object embeds, and pins base-uri and form-action", () => {
    const csp = serializeCsp(baselineCsp(base));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allowlists GitHub avatars in img-src and no other avatar host", () => {
    const csp = serializeCsp(baselineCsp(base));
    expect(csp).toMatch(
      /img-src[^;]*https:\/\/avatars\.githubusercontent\.com/,
    );
    expect(csp).not.toMatch(/googleusercontent|discordapp|licdn\.com/);
    expect(SHARED_ORIGINS.img).toContain(
      "https://avatars.githubusercontent.com",
    );
  });

  it("keeps style-src 'unsafe-inline' (no nonce/hash wiring for style yet)", () => {
    expect(serializeCsp(baselineCsp(base))).toMatch(
      /style-src[^;]*'unsafe-inline'/,
    );
  });

  it("returns a fresh map each call, so an app can extend it safely", () => {
    const a = baselineCsp(base);
    a["connect-src"]!.push("https://example.com");
    expect(baselineCsp(base)["connect-src"]).toEqual(["'self'"]);
  });

  it("is stable for the same input", () => {
    expect(serializeCsp(baselineCsp(base))).toBe(
      serializeCsp(baselineCsp(base)),
    );
  });

  describe("script-src", () => {
    it("carries the given nonce and 'strict-dynamic', never 'unsafe-inline'", () => {
      const csp = serializeCsp(baselineCsp({ ...base, nonce: "abc123" }));
      expect(csp).toMatch(/script-src[^;]*'nonce-abc123'/);
      expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("keeps 'self' as a fallback for browsers that ignore 'strict-dynamic'", () => {
      expect(serializeCsp(baselineCsp(base))).toMatch(/script-src[^;]*'self'/);
    });

    it("adds 'unsafe-eval' only in development, for Vite/React Fast Refresh", () => {
      const csp = (environment: "development" | "staging" | "production") =>
        serializeCsp(baselineCsp({ ...base, environment }));
      expect(csp("development")).toMatch(/script-src[^;]*'unsafe-eval'/);
      expect(csp("staging")).not.toMatch(/script-src[^;]*'unsafe-eval'/);
      expect(csp("production")).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("leaves the nonce and 'strict-dynamic' out when no nonce is given", () => {
      const csp = serializeCsp(baselineCsp({ environment: "production" }));
      expect(csp).toMatch(/script-src 'self'(;|$)/);
      expect(csp).not.toContain("'nonce-");
      expect(csp).not.toContain("'strict-dynamic'");
    });
  });
});

describe("serializeCsp", () => {
  it("joins sources with spaces and directives with '; '", () => {
    expect(
      serializeCsp({ "a-src": ["'self'", "x"], "b-src": ["'none'"] }),
    ).toBe("a-src 'self' x; b-src 'none'");
  });

  it("serializes an app's spread-and-extend of the baseline", () => {
    const csp = baselineCsp(base);
    const out = serializeCsp({
      ...csp,
      "connect-src": [...csp["connect-src"]!, "https://api.devdogsuga.org"],
      "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    });
    expect(out).toContain("connect-src 'self' https://api.devdogsuga.org");
    expect(out).toContain("frame-src 'self' https://challenges.cloudflare.com");
  });
});

describe("originOf", () => {
  it("drops path, query and credentials", () => {
    expect(originOf("https://api.devdogsuga.org/some/path?query=1")).toBe(
      "https://api.devdogsuga.org",
    );
    expect(originOf("https://examplekey@o123.ingest.us.sentry.io/456")).toBe(
      "https://o123.ingest.us.sentry.io",
    );
  });

  it("returns null for an unparseable URL", () => {
    expect(originOf("not-a-url")).toBeNull();
  });
});
