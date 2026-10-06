# Backstage

**Backstage is a public, never-deployed monorepo that publishes machinery to
npm under `@devdogsuga`.** It is not a second copy of the product. Nothing in
here runs anywhere, ever — [DevDogsUGA](https://github.com/DevDogsUGA/DevDogsUGA)
(the product monorepo) remains the only repository with runtimes, deploys,
secrets, or user-facing content.

> **In transition (TASK-478).** The platform, `apps/platform` and
> `packages/email`, now lives here, with its history. The "never deployed" and
> "DevDogsUGA owns runtimes" lines below describe the layout before that move
> and are rewritten when the deploys follow. See [Platform
> development](#platform-development).

## What lives here vs. there

- **Backstage publishes machinery**: shared library packages any DevDogs repo
  (or, eventually, anyone) can `pnpm add @devdogsuga/<package>`. Wave 1
  migrated `config`, `telemetry`, `env`, `db`, `brand`, and `newsletter` here from DevDogsUGA's `packages/`; `events` followed after,
  once `packages/events` in the product repo was ready to move out entirely.
  The two CLIs live here too: `@devdogsuga/devtools` (contributors, needs a
  DevDogsUGA checkout) and `@devdogsuga/backstage` (officers, production and CI,
  runs anywhere through `pnpm dlx`). They share the private `@devdogsuga/cli-core`,
  which `tsdown` inlines into both and which is never published.
  See `CUTOVER.md` for the migrated-from sha and what stays forward-ported.
- **DevDogsUGA keeps anything a contributor authors** — app code, page
  templates, email/OG templates, the env variable _registry_ (the values;
  this repo only ships the framework that reads them), generated database
  types, migrations, and every deployment, cron, and secret binding.
- `apps/slides` is the one exception to "nothing deploys": it's not a
  service, it's the source for officer/workshop slide decks (Slidev),
  currently including the 9/28 Supabase workshop deck. It builds static
  output; nothing here serves it.
- `competitions/TEMPLATE.md` is the officer template for weekly competition
  briefs: copy it into a new draft in the private Competitions project.

Full design rationale (principles, mechanism, the package ledger) and
migration-specific detail live outside this repo, in Sloan's planning notes
("Backstage Packages — Implementation Plan" and its Wave 1 build sheet).

## Platform development

The platform is built here but still reads its database and docs from
DevDogsUGA: `supabase/` (migrations, seeds, `config.toml`), `packages/supabase`
(generated types, RLS tests), `docs/` and `packages/docs-kit` stay there.

- **Sibling clone.** Keep DevDogsUGA next to this repo (`../DevDogsUGA`) and run
  `pnpm install` in it first: the linked packages resolve their own dependencies
  from its `node_modules`. If it lives elsewhere, set `DEVDOGSUGA_DIR`.
- **The `devdogsuga/` link.** `pnpm install` runs `scripts/devdogsuga.mjs`, which
  creates a gitignored symlink `devdogsuga` to that clone and fails with a fix if
  there is none. The platform depends on `link:../../devdogsuga/docs` and
  `link:../../devdogsuga/packages/supabase`, and its scripts and tests use paths
  under `devdogsuga/`. `pnpm devdogsuga` prints where it points. In CI
  DevDogsUGA is checked out into `devdogsuga/` directly.
- **`devdogsuga.lock`** is one full commit SHA: the DevDogsUGA commit this
  Backstage commit is built against. A sibling on any other commit only warns,
  which is normal while you write a migration there; move the lock in the same
  change that depends on it.
- **Env files.** `with-env` reads `.env` and `.env.generated` from this repo's
  root (both gitignored). Copy them from DevDogsUGA's root. The local Supabase stack is still started from DevDogsUGA
  and writes `.env.generated` there, so copy that file again after a restart.
- **Build env.** `DEPLOY_ENV=development pnpm -F platform build` against the
  sibling's local stack; `pnpm -F platform test:db` needs that stack running.
- **Patches.** `patches/` and `patchedDependencies` are copies of DevDogsUGA's
  (it still builds schedule-builder with them). Because they are keyed to exact
  versions, `apps/platform` pins `react` and `react-dom` to 19.2.8.
- **Drift.** The `catalog`, `overrides`, `patchedDependencies` and `patches/` are
  copies of DevDogsUGA's, so `pnpm check:toolchain` compares them with the
  `devdogsuga/` checkout and fails on any shared entry that differs (entries only
  one side has are listed, not failed). `pnpm check:patches` audits each patch
  against its upstream fix and says which ones can be removed;
  `pnpm test:patches` and `pnpm test:toolchain` run those scripts' tests. All
  three scripts run on Node's built-in TypeScript support, with no install.

### CI for the platform

- **`validate`** runs lint, typecheck and tests for the whole workspace
  (platform and `packages/email` included) and `pnpm -F platform types:cf:check`.
  The platform's own build is left to `database`.
- **`database`** starts the local Supabase stack from `devdogsuga/supabase`
  (the commit in `devdogsuga.lock`), runs `pnpm -F platform test:db`, then builds
  the platform with the env schema enforced against `.github/ci.env` (placeholders
  only) plus the stack's generated values. The stack's Docker images are cached by
  Supabase CLI version and `config.toml`. The RLS suite, the generated Database
  types check and the migration-order check stay in DevDogsUGA's CI.
- **`toolchain`** fails on drift from DevDogsUGA (above) and warns, through
  `::warning::` annotations, when a patch's upstream fix has shipped. Daily, the
  `patch-issues` job opens or refreshes one issue titled `Remove patch <name>`
  per removable patch; only that job holds `issues: write`.
- Every job that installs the workspace goes through
  `.github/actions/setup-workspace`, which uses
  `.github/actions/checkout-devdogsuga` to fetch DevDogsUGA at the locked SHA
  into `devdogsuga/` and installs it before this workspace.

## Releases

Fully automatic — no changesets, no version bump PRs, no human publish step.
Every merge to `main` that changes a package's contents patch-bumps and
republishes just that package, with npm provenance and **no npm token of any
kind** (OIDC trusted publishing). See `.github/workflows/publish.yaml` and
`scripts/publish-changed-packages.mjs` for the mechanism, and that workflow's
header comment for the one-time setup this needs on npmjs.com/GitHub before
it can run at all — none of that is configured yet.

## Scripts

```bash
pnpm build       # pnpm -r build   — builds every package (and the slides app)
pnpm typecheck   # pnpm -r typecheck
pnpm test        # pnpm -r test
pnpm dev         # slides dev server, on the newest deck (or: pnpm dev <deck>)
pnpm check:scripts  # every script name is in the club's script vocabulary
pnpm check:toolchain  # catalog, overrides and patches/ agree with DevDogsUGA's
pnpm check:patches    # patches against their upstream fixes (--json for a report)
```

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/Backstage.git
cd Backstage
corepack enable && pnpm install
pnpm build
```
