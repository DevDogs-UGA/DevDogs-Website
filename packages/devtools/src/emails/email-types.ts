/**
 * Type-only stand-in for `@devdogsuga/email`'s generated `Templates` map.
 *
 * `@devdogsuga/email` is `"private": true` and never published — it stays
 * in DevDogsUGA and devtools resolves it FROM the repo at runtime
 * (`repo/source.ts`'s `loadEmail()`). Backstage has no copy to pull the
 * real generated type from, so `fixtures.ts`'s `satisfies` check is
 * loosened to "every template's fixture is a flat string-prop object"
 * instead of the real per-template exact prop shape. A prop typo here is
 * caught at runtime (the real `render()` throws on a missing required
 * prop), not at Backstage's typecheck time.
 */
export type EmailTemplates = Record<string, Record<string, string>>;
