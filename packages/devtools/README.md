# @devdogsuga/devtools

Contributor CLI for workspace tasks, runtime infrastructure, generated
content, configuration, and moderation checks.

```bash
pnpm devtools                      # no arguments: menu of interactive commands
pnpm devtools db start             # boot Supabase on this machine
pnpm devtools db connect <ref>     # or register a hosted project as the remote target
pnpm devtools db reset             # replay migrations, then seeds, then regenerate types
pnpm devtools cron run             # choose a configured route cron
pnpm devtools workflows run        # choose a configured Cloudflare Workflow
pnpm devtools workflows serve      # keep an app-scoped Wrangler runtime open
```

```bash
pnpm devtools supabase db push     # the real tool, with the tier's --db-url filled in
pnpm devtools wrangler|drizzle-kit|psql …
pnpm devtools preset apply-migrations   # db push, then asks about types:db
```

`supabase` adds `--db-url` or `--project-ref` from the session's tier unless you
passed `--local`, `--linked`, `--db-url` or `--project-ref` yourself. It never
falls back to the linked project and never adds `--yes`. Every run prints the
exact command afterwards.

Against `staging` or `production`, every command asks once before it runs
(`--yes` answers it). With no terminal, or `CI=true`, there is no menu and no
banner, the tier must be named (`--tier` or `DEPLOY_ENV`), confirmations need
`--yes`, and `--no-env` skips loading env files.

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here.

## Telemetry disclosure

This CLI reports its own crashes to Sentry (see `src/telemetry.ts`), on by
default, in both `pnpm devtools` and `devtools-ci`:

- **What**: uncaught errors only — a captured exception plus a `command` tag
  naming the subcommand that threw (e.g. `db reset`, `deploy platform`).
  Nothing about a successful run is ever sent.
- **When**: every run, unless `DEVTOOLS_TELEMETRY=0` is set (per-machine or
  per-job opt-out) — or the build has no DSN. The DSN is baked in when
  Backstage's `publish.yaml` builds the package, from the repo's
  `DEVTOOLS_SENTRY_DSN` Actions variable, so only published builds report;
  local builds and `pnpm pack:local` tarballs don't. Either condition means
  no `Sentry.init()` call happens: no network request, no console output.
- **What's scrubbed**: this CLI touches local `.env` files, so every event
  passes through
  `@devdogsuga/telemetry`'s shared scrubbers before it leaves the process —
  file paths reduced to basenames, email addresses redacted, and
  token/secret-shaped values stripped out of messages, breadcrumbs, and
  stack frames. See Backstage's `packages/telemetry/src/scrub.ts` for exactly what each
  scrubber matches.

## Layout

`src/` is one folder per domain (kebab-case). A domain declares its commands in
`catalog.ts` (inert data) and owns its handlers in `commands.ts`; `src/catalog.ts`
composes the tree and `src/cli.ts` maps top-level command names to handlers. The
shared core (repo and peer loading, ui, telemetry, tier and env entry, the
catalog, help and menu) lives in the private `@devdogsuga/cli-core` package,
which `tsdown` inlines into `dist/`. Only the core is bundled: every other
import stays external and must be declared in this package's `dependencies` or
`peerDependencies`, and the build fails when one is not.

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
