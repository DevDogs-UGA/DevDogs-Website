# @devdogsuga/headers

Security response headers for DevDogs apps. The package holds the baseline;
each app defines its own policy on top, so adding a third-party origin to one
app is a change in that app only. No dependencies.

## What it exports

- `baselineCsp({ nonce, environment })`: the CSP as a directive map
  (`default-src`, `base-uri`, `object-src`, `frame-ancestors`, `form-action`,
  `img-src`, `font-src`, `style-src`, `script-src`, `connect-src`,
  `worker-src`, `manifest-src`). `script-src` is the nonce plus
  `'strict-dynamic'`, with `'unsafe-eval'` in development only.
- `SHARED_ORIGINS`: origins every app needs (GitHub avatars for `img-src`).
- `baselineHeaders({ environment })`: HSTS (not in development),
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a
  locked-down `Permissions-Policy`.
- `serializeCsp()`, `originOf()`, `generateNonce()`, `CSP_HEADER`
  (`Content-Security-Policy-Report-Only` for now).
- `buildSecurityHeaders()` and `applySecurityHeaders()`: baseline headers plus
  the app's CSP, as entries for Next's `headers()` or set onto a `Headers`.

## Usage

```ts
import {
  applySecurityHeaders,
  baselineCsp,
  generateNonce,
  originOf,
} from "@devdogsuga/headers";

const csp = baselineCsp({ nonce: generateNonce(), environment });
applySecurityHeaders(response.headers, {
  environment,
  csp: {
    ...csp,
    "connect-src": [...csp["connect-src"], originOf(supabaseUrl)!],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
  },
});
```

## Report-Only, not enforcing

`CSP_HEADER` is `Content-Security-Policy-Report-Only`. `style-src` still needs
`'unsafe-inline'`, and enforcing is gated on a `report-to` endpoint and
watching violations in production first. Changing it is one line here.

## HSTS

Never carries `preload`: submitting to the preload list is a one-way door.
Skipped in development, where a local server is plain HTTP.
