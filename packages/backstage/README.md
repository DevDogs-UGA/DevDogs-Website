# @devdogsuga/backstage

The officer and production CLI: everything that needs production secrets and is
used only by the two people who hold them (and CI), plus the tools that need
only the user's own login. Run it anywhere:

```bash
pnpm dlx --config.minimum-release-age=0 --config.dlx-cache-max-age=0 @devdogsuga/backstage
```

It always runs the latest publish, CI included, so local runs and CI runs
match. The two flags matter outside a DevDogsUGA checkout, where the workspace's
`minimumReleaseAgeExclude` and `dlxCacheMaxAge: 0` do not apply (inside one,
`pnpm backstage` is the script).

It **starts without a checkout**. Help, `version`, `completions` and anything
run with `--no-env` never look for one; a command that reads a checkout says
"run this from inside a DevDogsUGA clone" and exits 1. The DevDogsUGA libraries
it reads (`@devdogsuga/env`, `@devdogsuga/db`) are optional peers, resolved
through the checkout by the commands that need them.

```bash
pnpm backstage                                   # no arguments: a menu
pnpm backstage env pull --target production      # Bitwarden → .env.production
pnpm backstage env audit --target production     # every store, plus orphaned Worker secrets
pnpm backstage env audit --target production --prune
pnpm backstage deploy platform --tier staging    # token check, secrets file, wrangler deploy
pnpm backstage --no-env deploy write-env         # the CI steps that supply their own environment
pnpm backstage --no-env planner status           # the preflight credential, from DB_URL
```

## Commands

| Command                                        | What it does                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `deploy <app> --tier <t>`                      | Checks `CLOUDFLARE_API_TOKEN`, writes the Worker's secrets file, deploys, removes it.  |
| `deploy write-env`                             | Composes `.env.<DEPLOY_ENV>` from the GitHub environment.                              |
| `deploy preflight`                             | Classifies the project: paused (skip) or broken (fail).                                |
| `deploy plan`, `deploy migrate`                | Dry-run the migrations into the job summary; apply them to `DB_URL`.                   |
| `deploy smoke --tier <t> [--app]`              | Public routes answer 200, the auth redirect works, this deploy's Sentry release shows. |
| `deploy reconcile --tier <t>`                  | The platform's config reconcile, after the deploy (`CRON_SECRET`).                     |
| `env pull\|push\|audit --target <t>`           | One env file per target, synced to Bitwarden and GitHub. `audit` lists orphans.        |
| `planner status\|create\|reset-password\|drop` | The `migration_planner` role the preflight tier holds.                                 |

`smoke` and `reconcile` replace DevDogsUGA's `packages/deploy-checks`. The
per-app data (hosts, public paths, the protected path and its redirect) stays in
DevDogsUGA, as a `smoke` field on each app's entry in `workers.json`:

```json
[
  {
    "path": "apps/platform",
    "smoke": {
      "hosts": {
        "staging": "staging.devdogsuga.org",
        "production": "devdogsuga.org"
      },
      "publicPaths": ["/", "/events"],
      "protectedPath": "/console/permissions",
      "protectedRedirectPrefix": "/auth"
    }
  },
  "apps/sandbox"
]
```

Entries may be bare paths or objects. While the field is absent, the table
`deploy-checks` carried answers for `platform` and `schedule-builder`.

## Tiers, `--no-env`, CI

Nothing is ever asked at launch. `--tier <t>` (anywhere in argv) or
`DEPLOY_ENV` names the session's tier and so the env file loaded; with neither
the session is plain development (where `BWS_ACCESS_TOKEN` lives). `deploy`
refuses to run without one of the two.

`--no-env` loads no env files and does not look for a checkout: the caller's
environment is the environment. It is for `deploy write-env`, which creates the
file tier resolution would otherwise insist on reading, and for CI steps that
hold one narrow credential in the job's `env:` block.

With no terminal, or `CI=true`: no menu, no banner, plain lines, errors on
stderr, and every confirmation needs `--yes`. Against staging or production a
command that is not read-only asks once first (`--yes` answers it).

Each command checks for the secrets it uses up front: `deploy <app>` for
`CLOUDFLARE_API_TOKEN`, `deploy reconcile` for `CRON_SECRET`, `env` for the
Secrets Manager token (flag, environment, then the Bitwarden vault, which `env`
signs in to and unlocks itself, then asking).

## The deprecated `devtools-ci` bins

DevDogsUGA's `main` still calls `devtools-ci deploy …` from the pinned
`@devdogsuga/devtools`. Those bins live in devtools' package but run this
package's code (`src/ci-alias.ts`, bundled into devtools by `tsdown`; the
`./ci-alias` export is a source entry only that build resolves, and is not in
the published files). They keep the steps this CLI folded away: `deploy
require-token`, `require-planner` (now `planner status`), `secrets-file` (now
part of `deploy <app>`) and `orphans` (now `env audit [--prune]`). The cutover
(TASK-403) deletes them.

## Layout

Like devtools: `src/<domain>/catalog.ts` (inert data) and `commands.ts`;
`src/catalog.ts` composes the tree, `src/cli.ts` maps names to handlers,
`src/launch-core.ts` settles the tier before any command is imported. The
shared core is the private `@devdogsuga/cli-core`, which `tsdown` inlines; every
other import must be declared here, and the build fails when one is not.

`env.ts` is the operator manifest (`BWS_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`
and friends). It is a copy of devtools' own, kept identical by a test, because
each CLI loads the one beside it.

Contract tests (`pnpm test:contract`) pack the real tarball, install it with
install scripts off outside any repo (and check the Bitwarden native module
loads), and run it again inside the fixture repo. They gate publishing.

Crash reporting is the same as devtools' (Sentry, scrubbed, off with
`DEVTOOLS_TELEMETRY=0`); the release is named `backstage@<version>`.
