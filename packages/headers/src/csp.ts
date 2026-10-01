import { SHARED_ORIGINS } from "./origins.js";

/** A CSP as a directive-to-sources map, so apps can spread and extend it. */
export type CspDirectives = Record<string, string[]>;

/** The subset of `DeployEnvironment` (`@devdogsuga/env`) this package needs. */
export type Environment = "development" | "staging" | "production";

export interface BaselineCspInput {
  /**
   * The response's nonce (`generateNonce`), which gates `script-src`. Omit it
   * only for a response that carries no HTML: with no nonce, `script-src` is
   * `'self'` alone, which would block every inline script a page has.
   */
  nonce?: string;
  /**
   * Gates `'unsafe-eval'` on `script-src`, scoped to `"development"` only --
   * Vite/React Fast Refresh needs `eval` in dev; staging and production
   * never should.
   */
  environment: Environment;
}

/**
 * The directives every app starts from. Apps spread this and append their
 * own origins, e.g.:
 *
 * ```ts
 * const csp = baselineCsp({ nonce, environment });
 * serializeCsp({
 *   ...csp,
 *   "connect-src": [...csp["connect-src"], supabaseOrigin, sentryOrigin],
 * });
 * ```
 *
 * `script-src` carries a nonce plus `'strict-dynamic'`, not
 * `'unsafe-inline'`; where the nonce comes from is up to each app. `'self'`
 * stays alongside as a no-op fallback for browsers that honor host sources
 * but not `'strict-dynamic'`. `'unsafe-eval'` is dev-only.
 *
 * `style-src` keeps `'unsafe-inline'`: hydration and inline `style={{ ... }}`
 * rely on it, and React injects hoisted `<style>` tags with no nonce hook.
 *
 * `frame-ancestors 'none'` pairs with the `X-Frame-Options: DENY` header
 * from {@link baselineHeaders}, for browsers that understand only one.
 *
 * Fonts: apps use `next/font/google`, which self-hosts at build time, so no
 * font CDN is allowlisted.
 */
export function baselineCsp(input: BaselineCspInput): CspDirectives {
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": ["'self'", "data:", "blob:", ...SHARED_ORIGINS.img],
    "font-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": [
      "'self'",
      ...(input.nonce ? [`'nonce-${input.nonce}'`, "'strict-dynamic'"] : []),
      ...(input.environment === "development" ? ["'unsafe-eval'"] : []),
    ],
    "connect-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };
}

/** Origin (`scheme://host[:port]`) of a URL string, or `null` if unparseable. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Joins a directive map into the header value (`name a b; name c`). */
export function serializeCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}
