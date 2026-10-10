# @devdogsuga/devtools

Contributor CLI for a DevDogsUGA checkout: the real tools with the session's
tier filled in, a menu over them, and the checks CI runs.

```bash
pnpm devtools                           # no arguments: menu of interactive commands
pnpm devtools setup                     # prepare a checkout, then print the database next steps
pnpm devtools doctor                    # first stop: machine, tier, stack, types, buckets, seeded data
pnpm devtools supabase start            # boot Supabase on this machine
pnpm devtools jobs run                  # choose a background job (a cron sync or a Workflow) and run it
pnpm devtools jobs list                 # every job, its schedule, and schedules that never fire
pnpm devtools jobs serve                # keep an app-scoped Workflow runtime open
```

```bash
pnpm devtools supabase db push     # the real tool, with the tier's --db-url filled in
pnpm devtools wrangler|drizzle-kit|psql …
pnpm devtools apply-migrations     # db push, then asks about types:db
pnpm devtools restart-stack|new-migration|push-config
```

`cron` and `workflows` are aliases of `jobs` that narrow it to one kind:
`cron run` is `jobs run --kind sync` (quick syncs, the Worker cron routes) and
`workflows run` is `jobs run --kind long-running` (Cloudflare Workflows).

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
`preview`) replace them. `run` stays as a deprecated alias, hidden from the
menu, for callers that have not moved yet (TASK-404 removes it); `--help` names
its replacement. The retired `db`, `cf`, `gen`, `emails`, `grant-root` and
`preset` names are refused with where they went (`preset apply-migrations` is
now `apply-migrations`, and so on).

What always needs production secrets is not here. `deploy`, `env
pull|push|audit` and `planner` are in `@devdogsuga/backstage`
(`pnpm backstage …` from a Backstage clone; it is no longer published); `devtools
env` keeps `init`, `example` and `reset`, and `bw` is gone (backstage's `env`
signs in to Bitwarden itself). CI calls `backstage` directly.

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here. Its first screen lists every interactive command
under a plain-English title ("Restart local Supabase") with the command to
type beside it (`restart-stack`).

## Which repo it runs in

Both CLIs run from a DevDogsUGA checkout or from Backstage's (`package.json`
name `devdogs-monorepo` or `backstage`; the layout code is
`packages/cli-core/src/repo/layout.ts`). From Backstage, DevDogsUGA is
`<root>/devdogsuga`: a gitignored symlink to the sibling clone locally
(`pnpm devdogsuga`), a real checkout at the pinned SHA in CI.

| What                                                                                                  | Where                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/` (CLI cwd, config, migrations, seeds, avatars, env manifest), `database.types.ts`, `docs/` | DevDogsUGA's root (`devdogsuga/` from Backstage)                                                                                                                                                                                   |
| `workers.json`, `.github/`                                                                            | the repo you are in; DevDogsUGA without one manages no Workers                                                                                                                                                                     |
| apps (`cron`, `run`, `deploy <app>`, env manifests)                                                   | the repo you are in plus DevDogsUGA's `apps/`; on a name clash the repo you are in wins                                                                                                                                            |
| `.env`, `.env.<tier>`, `.env.generated`                                                               | the root of the repo you are in; `deploy write-env` and the local stack's `.env.generated` also write DevDogsUGA's root, because schedule-builder reads its own repo root. `env pull\|push\|reset` touch only the root you are in. |

`pnpm exec supabase` and `wrangler` run inside DevDogsUGA's workspace, so
`devdogsuga/` needs its own `pnpm install` before the commands that use them.

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
  local builds and `pnpm pack` tarballs don't. Either condition means
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
which `tsdown` inlines into `dist/`. Only that is bundled: every other
import stays external and must be declared in this package's `dependencies` or
`peerDependencies`, and the build fails when one is not
(`../../scripts/check-bundle-imports.mjs` reads the built output).

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
