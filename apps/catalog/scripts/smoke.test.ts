import { describe, expect, it } from "vitest";
import { smoke } from "./smoke.ts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=60, s-maxage=300",
};

/** A catalog that behaves; each test breaks one thing. */
function healthy(
  overrides: (url: string, init?: RequestInit) => Response | undefined = () =>
    undefined,
) {
  const calls: string[] = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const custom = overrides(url, init);
    if (custom) return Promise.resolve(custom);
    if (init?.method === "POST")
      return Promise.resolve(new Response("{}", { status: 405 }));
    if (url.includes("/subjects"))
      return Promise.resolve(
        Response.json(
          { error: { code: "invalid_parameter", message: "x" } },
          { status: 400 },
        ),
      );
    return Promise.resolve(
      Response.json({ terms: [] }, { headers: JSON_HEADERS }),
    );
  };
  return { fetchImpl, calls };
}

describe("smoke", () => {
  it("passes against a catalog with no data in it", async () => {
    const { fetchImpl } = healthy();
    const results = await smoke("https://x.test/catalog/v1/", fetchImpl, 0);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
  });

  it("fails when the route answers HTML from somewhere else, after retrying the propagation window", async () => {
    const { fetchImpl, calls } = healthy((url, init) =>
      init?.method === undefined && url.endsWith("/terms")
        ? new Response("<html>", { status: 522 })
        : undefined,
    );
    const results = await smoke("https://x.test/catalog/v1", fetchImpl, 0);
    expect(results[0]).toMatchObject({ ok: false, detail: "status 522" });
    expect(
      calls.filter((c) => c.startsWith("GET") && c.endsWith("/terms")).length,
    ).toBe(6);
  });

  it("fails when a write is not refused", async () => {
    const { fetchImpl } = healthy((_, init) =>
      init?.method === "POST" ? new Response("{}", { status: 200 }) : undefined,
    );
    const results = await smoke("https://x.test/catalog/v1", fetchImpl, 0);
    expect(results[2]).toMatchObject({ ok: false, detail: "status 200" });
  });

  it("fails when the response lacks CORS or cache headers", async () => {
    const { fetchImpl } = healthy((url, init) =>
      init?.method === undefined && url.endsWith("/terms")
        ? Response.json({ terms: [] })
        : undefined,
    );
    const results = await smoke("https://x.test/catalog/v1", fetchImpl, 0);
    expect(results[0]!.ok).toBe(false);
  });

  it("reports a network error as a failure, not a crash", async () => {
    const results = await smoke(
      "https://x.test/catalog/v1",
      () => Promise.reject(new Error("connection refused")),
      0,
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results[0]!.detail).toBe("connection refused");
  });
});
