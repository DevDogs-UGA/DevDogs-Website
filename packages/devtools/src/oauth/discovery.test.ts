import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryError, fetchIssuer } from "./discovery.js";

describe("fetchIssuer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the issuer discovery advertises, even when it differs from baseUrl", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(
        "https://api.devdogsuga.org/auth/v1/.well-known/openid-configuration",
      );
      return new Response(
        JSON.stringify({
          issuer: "https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const issuer = await fetchIssuer("https://api.devdogsuga.org");

    expect(issuer).toBe("https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("names the discovery URL and reason when the fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    await expect(fetchIssuer("https://api.devdogsuga.org")).rejects.toThrow(
      DiscoveryError,
    );
    await expect(fetchIssuer("https://api.devdogsuga.org")).rejects.toThrow(
      /https:\/\/api\.devdogsuga\.org\/auth\/v1\/\.well-known\/openid-configuration.*getaddrinfo ENOTFOUND/s,
    );
  });

  it("reports a non-2xx response by status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not found", { status: 404, statusText: "Not Found" }),
      ),
    );

    await expect(fetchIssuer("https://api.devdogsuga.org")).rejects.toThrow(
      /returned 404/,
    );
  });

  it("reports unparsable JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );

    await expect(fetchIssuer("https://api.devdogsuga.org")).rejects.toThrow(
      /did not return valid JSON/,
    );
  });

  it("reports a missing issuer field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    await expect(fetchIssuer("https://api.devdogsuga.org")).rejects.toThrow(
      /no "issuer" field/,
    );
  });
});
