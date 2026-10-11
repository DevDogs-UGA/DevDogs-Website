/**
 * The catalog API's caps and limits, in one place. The OpenAPI file states the
 * same numbers for clients; `test/contract.test.ts` fails if they drift apart,
 * and wrangler.jsonc's rate-limit bindings are checked against these too.
 */

/** `/search` returns at most this many courses; asking for more is a 400. */
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** `/sections` takes at most this many courses (codes and ids together). */
export const SECTIONS_MAX_COURSES = 15;

/** Per-IP requests a minute, every endpoint. */
export const RATE_LIMIT_PER_MINUTE = 120;
/** Per-IP requests a minute on `/search`, which is the expensive one. */
export const SEARCH_RATE_LIMIT_PER_MINUTE = 60;
/** The rate limit's window, in seconds: the `Retry-After` of a 429. */
export const RATE_LIMIT_PERIOD_SECONDS = 60;

/** How long a browser may reuse a response without asking. */
export const BROWSER_CACHE_SECONDS = 60;
/** How long the edge may serve a response without running the Worker. The scrape is daily, so five minutes costs nothing. */
export const EDGE_CACHE_SECONDS = 300;
