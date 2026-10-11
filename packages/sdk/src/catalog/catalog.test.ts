import { describe, expect, it } from "vitest";
import { ApiError, CATALOG_SERVERS, createCatalogClient } from "./index.js";

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(
  seen: Seen[],
  body: unknown,
  init: ResponseInit = { status: 200 },
): typeof fetch {
  return (input, requestInit) => {
    seen.push({
      url: typeof input === "string" ? input : "",
      init: requestInit,
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      }),
    );
  };
}

const BASE = "https://api-staging.devdogsuga.org/catalog/v1/";

describe("createCatalogClient", () => {
  it("calls the path under baseUrl and sends X-Client", async () => {
    const seen: Seen[] = [];
    const client = createCatalogClient({
      baseUrl: BASE,
      client: "dogdays/1.0",
      fetch: fakeFetch(seen, { terms: [] }),
    });
    expect(await client.listTerms()).toEqual({ terms: [] });
    expect(seen[0]?.url).toBe(
      "https://api-staging.devdogsuga.org/catalog/v1/terms",
    );
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers["x-client"]).toBe("dogdays/1.0");
    expect(seen[0]?.init?.method).toBe("GET");
  });

  it("builds the query from the given parameters and skips the absent ones", async () => {
    const seen: Seen[] = [];
    const client = createCatalogClient({
      baseUrl: BASE,
      fetch: fakeFetch(seen, { term: 202702, query: "x", limit: 20, results: [] }),
    });
    await client.searchCourses({ term: 202702, q: "intro to programming" });
    expect(new URL(seen[0]!.url).searchParams.toString()).toBe(
      "term=202702&q=intro+to+programming",
    );
    await client.searchCourses({ term: 202702, q: "x", limit: 5 });
    expect(new URL(seen[1]!.url).searchParams.get("limit")).toBe("5");
  });

  it("puts path parameters in the path, encoded", async () => {
    const seen: Seen[] = [];
    const client = createCatalogClient({
      baseUrl: BASE,
      fetch: fakeFetch(seen, { term: 202702, subject: {}, courses: [] }),
    });
    await client.listSubjectCourses({ abbr: "CS CI", term: 202702 });
    expect(new URL(seen[0]!.url).pathname).toBe(
      "/catalog/v1/subjects/CS%20CI/courses",
    );
  });

  it("takes an omitted params object when every parameter is optional", async () => {
    const seen: Seen[] = [];
    const client = createCatalogClient({
      baseUrl: BASE,
      fetch: fakeFetch(seen, { term: null, subjects: [] }),
    });
    await client.listSubjects();
    expect(new URL(seen[0]!.url).search).toBe("");
    await client.listSubjects({ term: 202608 });
    expect(new URL(seen[1]!.url).search).toBe("?term=202608");
  });

  it("turns an API error into an ApiError with the code and Retry-After", async () => {
    const client = createCatalogClient({
      baseUrl: BASE,
      fetch: fakeFetch(
        [],
        { error: { code: "rate_limited", message: "Slow down" } },
        { status: 429, headers: { "retry-after": "12" } },
      ),
    });
    await expect(client.listTerms()).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      code: "rate_limited",
      message: "Slow down",
      retryAfterSeconds: 12,
    });
    await expect(client.listTerms()).rejects.toBeInstanceOf(ApiError);
  });

  it("survives a non-JSON failure", async () => {
    const client = createCatalogClient({
      baseUrl: BASE,
      fetch: () => Promise.resolve(new Response("<html>", { status: 502 })),
    });
    await expect(client.listTerms()).rejects.toMatchObject({
      status: 502,
      code: null,
      retryAfterSeconds: null,
    });
  });

  it("lists the servers the spec lists", () => {
    expect(CATALOG_SERVERS.staging).toBe(
      "https://api-staging.devdogsuga.org/catalog/v1",
    );
    expect(CATALOG_SERVERS.production).toBe(
      "https://api.devdogsuga.org/catalog/v1",
    );
  });
});
