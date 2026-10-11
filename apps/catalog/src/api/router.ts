import { isUnavailableError, type ReadSql } from "~/db/reader";
import { ApiError, invalid, type ErrorCode } from "./errors";
import {
  BROWSER_CACHE_SECONDS,
  EDGE_CACHE_SECONDS,
  RATE_LIMIT_PERIOD_SECONDS,
} from "./limits";
import {
  parseClient,
  parseCourseCode,
  parseCourseSelection,
  parseSearchLimit,
  parseSearchQuery,
  parseSubjectAbbr,
  parseTerm,
  requireTerm,
} from "./params";
import * as queries from "./queries";

/** Where the API lives on the zone; the Worker route is `<host>/catalog/v1/*`. */
export const API_PREFIX = "/catalog/v1";

type Handler = (url: URL, params: string[]) => (sql: ReadSql) => Promise<unknown>;

type Route = {
  /** The path after the prefix, with `:name` segments. */
  pattern: string;
  /** Which rate limiter applies besides the general one. */
  limiter?: "search";
  handle: Handler;
};

/**
 * Every route, in one table: the contract test compares it with the paths in
 * openapi/catalog.yaml, so neither can gain an endpoint without the other.
 */
export const ROUTES: readonly Route[] = [
  {
    pattern: "/terms",
    handle: () => (sql) => queries.listTerms(sql),
  },
  {
    pattern: "/subjects",
    handle: (url) => {
      const term = parseTerm(url.searchParams.get("term"));
      return (sql) => queries.listSubjects(sql, term);
    },
  },
  {
    pattern: "/subjects/:abbr/courses",
    handle: (url, [abbr]) => {
      const subject = parseSubjectAbbr(abbr!);
      const term = requireTerm(url.searchParams.get("term"));
      return (sql) => queries.listSubjectCourses(sql, subject, term);
    },
  },
  {
    pattern: "/search",
    limiter: "search",
    handle: (url) => {
      const term = requireTerm(url.searchParams.get("term"));
      const query = parseSearchQuery(url.searchParams.get("q"));
      const limit = parseSearchLimit(url.searchParams.get("limit"));
      return (sql) => queries.searchCourses(sql, term, query, limit);
    },
  },
  {
    pattern: "/courses/:abbr",
    handle: (url, [abbr]) => {
      const code = parseCourseCode(abbr!);
      const term = parseTerm(url.searchParams.get("term"));
      return (sql) => queries.getCourse(sql, code, term);
    },
  },
  {
    pattern: "/course-exists",
    handle: (url) => {
      const code = parseCourseCode(url.searchParams.get("abbr"));
      const term = parseTerm(url.searchParams.get("term"));
      return (sql) => queries.courseExists(sql, code, term);
    },
  },
  {
    pattern: "/sections",
    handle: (url) => {
      const term = requireTerm(url.searchParams.get("term"));
      const { codes, ids } = parseCourseSelection(
        url.searchParams.get("courses"),
        url.searchParams.get("courseIds"),
      );
      return (sql) => queries.listSections(sql, term, codes, ids);
    },
  },
];

/** Matches a path against a pattern, returning the `:name` captures (decoded) or null. */
export function matchRoute(pattern: string, path: string): string[] | null {
  const want = pattern.split("/");
  const have = path.split("/");
  if (want.length !== have.length) return null;
  const captures: string[] = [];
  for (let i = 0; i < want.length; i += 1) {
    const segment = want[i]!;
    if (segment.startsWith(":")) {
      if (have[i] === "") return null;
      try {
        captures.push(decodeURIComponent(have[i]!));
      } catch {
        throw invalid("The path is not valid percent-encoding.");
      }
    } else if (segment !== have[i]) {
      return null;
    }
  }
  return captures;
}

/** The slice of a Workers rate-limit binding the router uses. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The slice of the edge cache the router uses (`caches.default`). */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface ApiDeps {
  /** Runs `fn` as the read-only catalog role. */
  read<T>(fn: (sql: ReadSql) => Promise<T>): Promise<T>;
  limiter?: Limiter;
  searchLimiter?: Limiter;
  cache?: EdgeCache;
  /** `ctx.waitUntil`: lets the cache write finish after the response is sent. */
  waitUntil?: (promise: Promise<unknown>) => void;
  /** Where request telemetry goes; defaults to `console.info`. */
  log?: (line: Record<string, unknown>) => void;
}

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  // Public data, called from browsers on other origins (dogdays.dev).
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Retry-After",
} as const;

function json(
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...extra },
  });
}

function errorJson(
  status: number,
  code: ErrorCode,
  message: string,
  extra: Record<string, string> = {},
): Response {
  return json(status, { error: { code, message } }, extra);
}

const CACHEABLE = `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`;

/**
 * A cache key that treats `?term=1&q=x` and `?q=x&term=1` as one request, and
 * ignores everything that does not change the answer.
 */
export function cacheKeyFor(url: URL): Request {
  const params = [...url.searchParams].sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b),
  );
  const key = new URL(url.origin + url.pathname);
  for (const [name, value] of params) key.searchParams.append(name, value);
  return new Request(key.toString(), { method: "GET" });
}

/**
 * The whole request pipeline, free of Workers globals so tests drive it with
 * plain `Request`s: method check, route, per-IP rate limit, edge cache, read.
 */
export async function handleApiRequest(
  request: Request,
  deps: ApiDeps,
): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const client = parseClient(request.headers.get("X-Client"));
  const log = deps.log ?? ((line) => console.info(JSON.stringify(line)));
  let route = "unmatched";

  const finish = (response: Response, cache?: "hit" | "miss"): Response => {
    log({
      msg: "catalog_request",
      route,
      status: response.status,
      client,
      cache: cache ?? null,
      ms: Date.now() - started,
    });
    return response;
  };

  if (request.method === "OPTIONS") {
    return finish(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "X-Client",
          "Access-Control-Max-Age": "86400",
        },
      }),
    );
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return finish(
      errorJson(405, "method_not_allowed", "The catalog is read-only: GET only.", {
        Allow: "GET, HEAD, OPTIONS",
      }),
    );
  }

  try {
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
      throw new ApiError(404, "not_found", "No such endpoint.");
    }
    const path = url.pathname.slice(API_PREFIX.length);

    let matched: { route: Route; params: string[] } | null = null;
    for (const candidate of ROUTES) {
      const params = matchRoute(candidate.pattern, path);
      if (params) {
        matched = { route: candidate, params };
        break;
      }
    }
    if (!matched) throw new ApiError(404, "not_found", "No such endpoint.");
    route = matched.route.pattern;

    // Per-IP rate limits come first, so a flood of cache hits is limited too.
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limiters = [
      deps.limiter,
      matched.route.limiter === "search" ? deps.searchLimiter : undefined,
    ];
    for (const limiter of limiters) {
      if (limiter && !(await limiter.limit({ key: ip })).success) {
        return finish(
          errorJson(429, "rate_limited", "Too many requests. Slow down.", {
            "Retry-After": String(RATE_LIMIT_PERIOD_SECONDS),
          }),
        );
      }
    }

    // Validate before the cache: a malformed request is a 400 whether or not
    // an answer is cached for something similar, and costs no database time.
    const read = matched.route.handle(url, matched.params);

    const key = cacheKeyFor(url);
    const cached = await deps.cache?.match(key);
    if (cached) {
      return finish(withHeadHandling(request, cached), "hit");
    }

    let response: Response;
    try {
      response = json(200, await deps.read(read), { "Cache-Control": CACHEABLE });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // A short negative cache, so probing for courses that do not exist
        // costs the database once a minute per name, not once per request.
        response = errorJson(404, error.code, error.message, {
          "Cache-Control": `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${BROWSER_CACHE_SECONDS}`,
        });
      } else {
        throw error;
      }
    }
    if (deps.cache && (response.status === 200 || response.status === 404)) {
      const write = deps.cache.put(key, response.clone());
      if (deps.waitUntil) deps.waitUntil(write);
      else await write;
    }
    return finish(withHeadHandling(request, response), "miss");
  } catch (error) {
    if (error instanceof ApiError) {
      return finish(withHeadHandling(request, errorJson(error.status, error.code, error.message)));
    }
    if (isUnavailableError(error)) {
      console.error("catalog read unavailable:", error);
      return finish(
        errorJson(503, "unavailable", "The catalog database is busy. Try again shortly.", {
          "Retry-After": "5",
        }),
      );
    }
    // Rethrown to Sentry's `withSentry` wrapper, which reports it and
    // answers 500; the response below is only for callers without one.
    console.error("catalog request failed:", error);
    throw error;
  }
}

/** HEAD gets GET's status and headers, no body. */
function withHeadHandling(request: Request, response: Response): Response {
  if (request.method !== "HEAD") return response;
  return new Response(null, { status: response.status, headers: response.headers });
}
