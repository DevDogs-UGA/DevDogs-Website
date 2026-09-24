# devtools contract-test fixture

A minimal, committed, DevDogsUGA-shaped pnpm workspace — the root marker
`findRepoRoot()` looks for (`pnpm-workspace.yaml` + `package.json.name ===
"devdogs-monorepo"`), `workers.json`, one app with a `wrangler.jsonc` cron
trigger and a real `cloudflare/scheduled.ts`, a package with an `env.ts`
manifest, and a stub source-only package with a `devdogs-source` export
condition.

**Never installed or built directly.** `../contract/devtools.contract.test.ts`
copies this directory into a temp dir, packs the real `@devdogsuga/devtools`
(plus `@devdogsuga/telemetry` and `@devdogsuga/env`) into tarballs, points
`pnpm.overrides` at them, and `pnpm install`s that copy — see that file's
header for the full mechanism and why (the carve-out plan's §8: "devtools CI
must run its own contract tests against a fixture repo before publish").

`packages/demo-source/dist/index.js` is a hand-written stand-in for a
compiled build (this package is never actually built) — `.gitignore` carries
an explicit exception for it since a blanket `dist/` rule would otherwise
silently drop it.

Run the suite: `pnpm test:contract` (from `packages/devtools`), or `pnpm
--filter @devdogsuga/devtools test:contract` from the Backstage root. Slow —
a real `pnpm install` per run — which is why it is not part of the default
`pnpm test`.
