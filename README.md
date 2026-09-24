# Backstage

**Backstage is a public, never-deployed monorepo that publishes machinery to
npm under `@devdogsuga`.** It is not a second copy of the product. Nothing in
here runs anywhere, ever — [DevDogsUGA](https://github.com/DevDogsUGA/DevDogsUGA)
(the product monorepo) remains the only repository with runtimes, deploys,
secrets, or user-facing content.

## What lives here vs. there

- **Backstage publishes machinery**: shared library packages any DevDogs repo
  (or, eventually, anyone) can `pnpm add @devdogsuga/<package>`. Wave 1
  migrated `config`, `telemetry`, `env`, `db`, `brand`, `newsletter`, and
  `docs-compiler` here from DevDogsUGA's `packages/`; `events` followed after,
  once `packages/events` in the product repo was ready to move out entirely.
  See `CUTOVER.md` for the migrated-from sha and what stays forward-ported.
- **DevDogsUGA keeps anything a contributor authors** — app code, page
  templates, email/OG templates, the env variable *registry* (the values;
  this repo only ships the framework that reads them), generated database
  types, migrations, and every deployment, cron, and secret binding.
- `apps/slides` is the one exception to "nothing deploys": it's not a
  service, it's the source for officer/workshop slide decks (Slidev),
  currently including the 9/28 Supabase workshop deck. It builds static
  output; nothing here serves it.

Full design rationale (principles, mechanism, the package ledger) and
migration-specific detail live outside this repo, in Sloan's planning notes
("Backstage Packages — Implementation Plan" and its Wave 1 build sheet).

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
pnpm dev         # slides dev server
pnpm pack:local  # build + pnpm-pack every publishable package into .packs/
```

`pack:local` is the pre-publish bridge: before any package has ever been
published to npm, `DevDogsUGA` consumes these packages by pointing pnpm
`overrides` at the tarballs it writes to `.packs/`. See CUTOVER.md, "The
local-pack bridge".

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/Backstage.git
cd Backstage
corepack enable && pnpm install
pnpm build
```
