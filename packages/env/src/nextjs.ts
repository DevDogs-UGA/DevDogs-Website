/**
 * Re-export of `@t3-oss/env-nextjs`, so a consuming app's `env.ts` can depend
 * on `@devdogsuga/env/nextjs` instead of adding `@t3-oss/env` to its own
 * package.json. This package is the right place for that pin: every
 * `declare()`/`define()` manifest a consumer builds already imports the root
 * `@devdogsuga/env` export, and `createEnv()` is what turns that manifest into
 * the validated `process.env` object Next.js reads at build and runtime.
 *
 * Kept as a bare re-export rather than a wrapper: this package owns no
 * opinion about `createEnv()`'s options (`runtimeEnv`, `emptyStringAsUndefined`,
 * `skipValidation`, …) that a consumer wouldn't reasonably set for itself, and
 * wrapping it would just be one more place a future `@t3-oss/env-nextjs`
 * feature has to be threaded through before an app can use it.
 */
export * from "@t3-oss/env-nextjs";
