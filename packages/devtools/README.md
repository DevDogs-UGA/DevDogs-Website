# @devdogsuga/devtools

Contributor CLI for a DevDogsUGA checkout: the real tools with the session's
tier filled in, a menu over them, and the checks CI runs.

```bash
pnpm devtools                           # no arguments: menu of interactive commands
pnpm devtools setup                     # prepare a checkout, then print the database next steps
pnpm devtools doctor                    # first stop: machine, tier, stack, types, buckets, seeded data
pnpm devtools supabase start            # boot Supabase on this machine
pnpm devtools cron run                  # choose a configured route cron
pnpm devtools workflows run             # choose a configured Cloudflare Workflow
pnpm devtools workflows serve           # keep an app-scoped Wrangler runtime open
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

`pnpm devtools script` picks a package and then one of its scripts (or a script
and then a package that has it) and runs `pnpm -F <package> run <script>`;
`pnpm devtools script <package> <script>` skips the questions.

`--dry-run` prints what would run and runs nothing. A tool call prints as
`Would run: <command>`; a command that spawns or writes without a dry-run mode
of its own stops and prints its own command line. For the passthroughs and
`run`, the tool owns every flag after its name, so put ours first:
`pnpm devtools --dry-run supabase db push`.

When a run fails, devtools writes a log (`~/.local/state/devdogs/logs`, or
`DEVTOOLS_LOG_DIR`) with the command, versions, the tool commands that ran and
devtools' own output, secrets redacted, and prints its path and the Sentry
event id if telemetry sent one. Attach it to a #tech-support message.

`check migrations|env|workers|scripts` is what CI runs over the checkout (it
replaces DevDogsUGA's `packages/repo-checks`). They read the checkout and
nothing else: no tier, no env file. `pnpm devtools --help --json` prints every
command path (deprecated ones marked), for tools that check what a page shows.

The `db` and `cf` namespaces are gone: `supabase`, `wrangler`, `drizzle-kit`
and `psql` plus package scripts (`types:db`, `types:drizzle`, `types:cf`,
`preview`) replace them. What is left of `db` (`start`, `types`, `introspect`),
`cf preview` and `run` are deprecated aliases, hidden from the menu, for
callers that have not moved yet; `--help` names each replacement.

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here.

## Telemetry disclosure

This CLI reports its own crashes to Sentry (see `src/telemetry.ts`), on by
default, in both `pnpm devtools` and `devtools-ci`:

- **What**: uncaught errors only — a captured exception plus a `command` tag
  naming the subcommand that threw (e.g. `doctor`, `deploy platform`).
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
`peerDependencies`, and the build fails when one is not
(`scripts/check-bundle-imports.mjs` reads the built output).

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
