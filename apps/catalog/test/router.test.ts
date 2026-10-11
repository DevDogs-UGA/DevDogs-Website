import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_MAX_LIMIT,
  SECTIONS_MAX_COURSES,
} from "~/api/limits";
import {
  cacheKeyFor,
  handleApiRequest,
  matchRoute,
  type ApiDeps,
  type EdgeCache,
  type Limiter,
} from "~/api/router";
import type { ReadSql } from "~/db/reader";

/**
 * The request pipeline without a database: validation, caps, rate limits, the
 * edge cache and the error shapes. The `read` the tests hand in records that
 * it ran; a request that is refused must never reach it.
 */

const BASE = "https://api.devdogsuga.org/catalog/v1";

function setup(overrides: Partial<ApiDeps> = {}) {
  const reads: unknown[] = [];
  const deps: ApiDeps = {
    read: vi.fn(async (fn: (sql: ReadSql) => Promise<unknown>) => {
      reads.push(fn);
      // The queries are never executed here: the router only has to run them.
      return { fake: true };
    }) as unknown as ApiDeps["read"],
    log: () => undefined,
    ...overrides,
  };
  return { deps, reads };
}

async function get(
  path: string,
  deps: ApiDeps,
  init: RequestInit = {},
): Promise<{ response: Response; body: any }> {
  const response = await handleApiRequest(new Request(`${BASE}${path}`, init), deps);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

describe("validation (a 400 never reaches the database)", () => {
  it.each([
    ["/search?term=202702", "missing_parameter"],
    ["/search?q=algorithms", "missing_parameter"],
    ["/search?term=202702&q=%20%20", "missing_parameter"],
    ["/search?term=2027&q=x", "invalid_parameter"],
    ["/search?term=202703&q=x", "invalid_parameter"],
    ["/search?term=abcdef&q=x", "invalid_parameter"],
    [`/search?term=202702&q=${"x".repeat(101)}`, "invalid_parameter"],
    [`/search?term=202702&q=x&limit=${SEARCH_MAX_LIMIT + 1}`, "invalid_parameter"],
    ["/search?term=202702&q=x&limit=0", "invalid_parameter"],
    ["/search?term=202702&q=x&limit=-1", "invalid_parameter"],
    ["/search?term=202702&q=x&limit=ten", "invalid_parameter"],
    ["/sections?courses=CSCI1301", "missing_parameter"],
    ["/sections?term=202702", "missing_parameter"],
    ["/sections?term=202702&courseIds=1,x", "invalid_parameter"],
    ["/sections?term=202702&courses=!!", "invalid_parameter"],
    ["/subjects?term=202703", "invalid_parameter"],
    ["/subjects/CSCI/courses", "missing_parameter"],
    ["/subjects/TOOLONG/courses?term=202702", "invalid_parameter"],
    ["/courses/%20", "missing_parameter"],
    ["/courses/CSCI1301?term=nope", "invalid_parameter"],
    ["/course-exists", "missing_parameter"],
    ["/course-exists?abbr=CSCI1301&term=2027", "invalid_parameter"],
    ["/courses/%E0%A4%A", "invalid_parameter"],
  ])("%s -> 400 %s", async (path, code) => {
    const { deps, reads } = setup();
    const { response, body } = await get(path, deps);
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: { code, message: expect.any(String) } });
    expect(reads).toHaveLength(0);
  });

  it(`accepts a search of exactly ${SEARCH_MAX_LIMIT} results`, async () => {
    const { deps } = setup();
    const { response } = await get(`/search?term=202702&q=x&limit=${SEARCH_MAX_LIMIT}`, deps);
    expect(response.status).toBe(200);
  });

  it(`refuses ${SECTIONS_MAX_COURSES + 1} courses, however they are named, and accepts ${SECTIONS_MAX_COURSES}`, async () => {
    const { deps, reads } = setup();
    const code = (i: number) => `ABC${1000 + i}`;
    const sixteen = Array.from({ length: SECTIONS_MAX_COURSES + 1 }, (_, i) => code(i));

    const tooManyCodes = await get(`/sections?term=202702&courses=${sixteen.join(",")}`, deps);
    expect(tooManyCodes.response.status).toBe(400);
    expect(tooManyCodes.body.error.code).toBe("too_many_courses");

    // Codes and ids count together.
    const mixed = await get(
      `/sections?term=202702&courses=${sixteen.slice(0, 10).join(",")}&courseIds=1,2,3,4,5,6`,
      deps,
    );
    expect(mixed.response.status).toBe(400);
    expect(mixed.body.error.code).toBe("too_many_courses");

    const manyIds = await get(
      `/sections?term=202702&courseIds=${Array.from({ length: 16 }, (_, i) => i + 1).join(",")}`,
      deps,
    );
    expect(manyIds.body.error.code).toBe("too_many_courses");
    expect(reads).toHaveLength(0);

    // Duplicates do not count twice, and exactly the cap is fine.
    const ok = await get(
      `/sections?term=202702&courses=${sixteen.slice(0, SECTIONS_MAX_COURSES).join(",")},${code(0)}`,
      deps,
    );
    expect(ok.response.status).toBe(200);
  });
});

describe("routing and methods", () => {
  it("404s a path outside the API and a path under it that is not an endpoint", async () => {
    const { deps } = setup();
    for (const path of ["/nope", "/terms/extra", "/subjects/CSCI"]) {
      const { response, body } = await get(path, deps);
      expect(response.status, path).toBe(404);
      expect(body.error.code).toBe("not_found");
    }
    const outside = await handleApiRequest(
      new Request("https://api.devdogsuga.org/other/v1/terms"),
      deps,
    );
    expect(outside.status).toBe(404);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s is 405 with an Allow header", async (method) => {
    const { deps, reads } = setup();
    const { response, body } = await get("/terms", deps, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect(body.error.code).toBe("method_not_allowed");
    expect(reads).toHaveLength(0);
  });

  it("answers a CORS preflight, and every response carries the CORS header", async () => {
    const { deps } = setup();
    const preflight = await get("/terms", deps, { method: "OPTIONS" });
    expect(preflight.response.status).toBe(204);
    expect(preflight.response.headers.get("Access-Control-Allow-Headers")).toBe("X-Client");
    for (const path of ["/terms", "/nope", "/search"]) {
      const { response } = await get(path, deps);
      expect(response.headers.get("Access-Control-Allow-Origin"), path).toBe("*");
    }
  });

  it("answers HEAD like GET, without a body", async () => {
    const { deps } = setup();
    const response = await handleApiRequest(new Request(`${BASE}/terms`, { method: "HEAD" }), deps);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toMatch(/s-maxage=\d+/);
  });

  it("matches captures and decodes them", () => {
    expect(matchRoute("/courses/:abbr", "/courses/CSCI%201301")).toEqual(["CSCI 1301"]);
    expect(matchRoute("/courses/:abbr", "/courses/")).toBeNull();
    expect(matchRoute("/subjects/:abbr/courses", "/subjects/CSCI/courses")).toEqual(["CSCI"]);
  });
});

describe("rate limits", () => {
  const allow: Limiter = { limit: async () => ({ success: true }) };
  const deny: Limiter = { limit: async () => ({ success: false }) };

  it("429s with Retry-After when the per-IP limit says no, before touching the database", async () => {
    const { deps, reads } = setup({ limiter: deny });
    const { response, body } = await get("/terms", deps);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(body.error.code).toBe("rate_limited");
    expect(reads).toHaveLength(0);
  });

  it("applies the tighter search limit to /search only", async () => {
    const { deps } = setup({ limiter: allow, searchLimiter: deny });
    const search = await get("/search?term=202702&q=x", deps);
    expect(search.response.status).toBe(429);
    const terms = await get("/terms", deps);
    expect(terms.response.status).toBe(200);
  });

  it("keys the limit on the connecting IP", async () => {
    const keys: string[] = [];
    const limiter: Limiter = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };
    const { deps } = setup({ limiter });
    await get("/terms", deps, { headers: { "CF-Connecting-IP": "203.0.113.9" } });
    await get("/terms", deps);
    expect(keys).toEqual(["203.0.113.9", "unknown"]);
  });

  it("limits cache hits too, so a flood of repeats is still a flood", async () => {
    const cache = memoryCache();
    const first = setup({ cache });
    await get("/terms", first.deps);
    let denied = false;
    const limiter: Limiter = { limit: async () => ({ success: !denied }) };
    const second = setup({ cache, limiter });
    expect((await get("/terms", second.deps)).response.status).toBe(200);
    denied = true;
    expect((await get("/terms", second.deps)).response.status).toBe(429);
  });
});

function memoryCache(): EdgeCache & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    async match(request) {
      return store.get(request.url)?.clone();
    },
    async put(request, response) {
      store.set(request.url, response);
    },
  };
}

describe("the edge cache", () => {
  it("serves a repeat from the cache, and treats reordered parameters as the same request", async () => {
    const cache = memoryCache();
    const { deps, reads } = setup({ cache });
    const first = await get("/search?term=202702&q=intro", deps);
    const second = await get("/search?q=intro&term=202702", deps);
    expect(first.response.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(reads).toHaveLength(1);
  });

  it("keeps different requests apart", async () => {
    const cache = memoryCache();
    const { deps, reads } = setup({ cache });
    await get("/search?term=202702&q=intro", deps);
    await get("/search?term=202702&q=other", deps);
    await get("/search?term=202608&q=intro", deps);
    expect(reads).toHaveLength(3);
  });

  it("sorts parameters in the cache key, and ignores the X-Client header", async () => {
    const a = cacheKeyFor(new URL(`${BASE}/terms?x=1&y=2`));
    const b = cacheKeyFor(new URL(`${BASE}/terms?y=2&x=1`));
    expect(a.url).toBe(b.url);

    const cache = memoryCache();
    const { deps, reads } = setup({ cache });
    await get("/terms", deps, { headers: { "X-Client": "dogdays/1.4" } });
    await get("/terms", deps, { headers: { "X-Client": "dogpack/0.3" } });
    expect(reads).toHaveLength(1);
  });

  it("marks answers cacheable by browsers and the edge", async () => {
    const { deps } = setup();
    const { response } = await get("/terms", deps);
    expect(response.headers.get("Cache-Control")).toMatch(/^public, max-age=\d+, s-maxage=\d+$/);
  });

  it("writes through waitUntil when the Worker provides it", async () => {
    const cache = memoryCache();
    const pending: Promise<unknown>[] = [];
    const { deps } = setup({ cache, waitUntil: (p) => pending.push(p) });
    await get("/terms", deps);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(cache.store.size).toBe(1);
  });
});

describe("errors from the database", () => {
  it("answers 503 with Retry-After when a read times out, and does not cache it", async () => {
    const cache = memoryCache();
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), {
      code: "57014",
    });
    const { deps } = setup({
      cache,
      read: (async () => {
        throw timeout;
      }) as unknown as ApiDeps["read"],
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, body } = await get("/terms", deps);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(body.error.code).toBe("unavailable");
    expect(cache.store.size).toBe(0);
  });

  it("rethrows anything else, for Sentry's wrapper to report and turn into a 500", async () => {
    const { deps } = setup({
      read: (async () => {
        throw new Error("boom");
      }) as unknown as ApiDeps["read"],
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(get("/terms", deps)).rejects.toThrow("boom");
  });

  it("caches a 404 briefly, so probing for a missing course is cheap", async () => {
    const { ApiError } = await import("~/api/errors");
    const cache = memoryCache();
    let reads = 0;
    const { deps } = setup({
      cache,
      read: (async () => {
        reads += 1;
        throw new ApiError(404, "not_found", "No course NOPE0000.");
      }) as unknown as ApiDeps["read"],
    });
    const first = await get("/courses/NOPE0000", deps);
    expect(first.response.status).toBe(404);
    expect(first.response.headers.get("Cache-Control")).toMatch(/s-maxage=60$/);
    const second = await get("/courses/NOPE0000", deps);
    expect(second.response.status).toBe(404);
    expect(reads).toBe(1);
  });
});
