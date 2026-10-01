import { serializeCsp, type CspDirectives, type Environment } from "./csp.js";

/**
 * The header the CSP travels in. Report-Only for now; switching this to
 * `Content-Security-Policy` is the one-line change that enforces the policy
 * everywhere, an edge-nonce path included.
 */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

/** One header, in the `{ key, value }` shape Next's `headers()` expects. */
export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * Permissions-Policy denying every sensor/capability the apps don't use.
 * Camera included: check-in is a code a member types or scans with their
 * phone's own camera app, and nothing calls `getUserMedia`.
 */
export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "interest-cohort=()",
].join(", ");

/**
 * The hardening headers every app sends, without the CSP.
 *
 * HSTS is skipped in development: it asserts "always use HTTPS for this
 * host", which is false for a local dev server on plain HTTP, and a browser
 * that believed it would refuse the connection. It never carries `preload`:
 * submitting to the preload list is a one-way door, not something to opt
 * into as a side effect of a headers change.
 */
export function baselineHeaders(input: {
  environment: Environment;
}): HeaderEntry[] {
  return [
    ...(input.environment === "development"
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    // `frame-ancestors 'none'` is the modern equivalent; kept for older
    // browsers and crawlers that only honor `X-Frame-Options`.
    { key: "X-Frame-Options", value: "DENY" },
  ];
}

export interface SecurityHeadersInput {
  environment: Environment;
  /** The app's CSP: the baseline plus its own origins. */
  csp: CspDirectives;
}

/** The baseline hardening headers plus the app's CSP, as header entries. */
export function buildSecurityHeaders(
  input: SecurityHeadersInput,
): HeaderEntry[] {
  return [
    ...baselineHeaders(input),
    { key: CSP_HEADER, value: serializeCsp(input.csp) },
  ];
}

/**
 * Sets every header from {@link buildSecurityHeaders} onto a `Headers`
 * instance (mutates in place, returns it for chaining), for middleware.
 * Middleware is the authoritative path; a static `headers()` config only
 * fills in routes the middleware matcher excludes.
 */
export function applySecurityHeaders(
  headers: Headers,
  input: SecurityHeadersInput,
): Headers {
  for (const { key, value } of buildSecurityHeaders(input)) {
    headers.set(key, value);
  }
  return headers;
}
