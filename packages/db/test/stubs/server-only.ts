// Stub for the `server-only` package's side-effecting import guard.
//
// The real package throws on import unless a bundler resolves its
// `react-server` export condition to a no-op (see its `package.json`).
// Plain Vitest never sets that condition, so `packages/db/vitest.config.ts`
// aliases `server-only` to this empty module instead — see the README's
// "@devdogsuga/db/server" section for the consumer-facing version of this
// same requirement.
export {};
