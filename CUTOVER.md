# Wave-3 cutover checklist

Consolidated at the end of Wave 1, from the divergences the migration actually
created. Wave 1 copied eight packages out of `DevDogsUGA` into this repo; it
changed **nothing** in `DevDogsUGA`, which is still the live source of truth.
So right now every migrated package exists twice, and the two copies are only
identical until someone edits one.

**That divergence window is the thing this checklist exists to close.** Keep it
short.

Blocked on all three of: the `@devdogsuga` npm org being claimed, this repo
having a GitHub remote, and a first publish of each package existing on the
registry. See `.github/workflows/publish.yaml`'s header for the full
precondition list — it is inert until then. Until that first publish exists,
see "The local-pack bridge" below for how `DevDogsUGA` consumes these packages
in the meantime.

Migrated from `DevDogsUGA@2165a7230e51fc922a3b37de51450f4f6c37a699`, and kept
forward-ported up to `DevDogsUGA@e5f8737ad004ecffadf5ac0a4f2072cd855ac3c7`.
Anything merged into those packages in the product repo after that sha has to
be forward-ported before the consumer switches over, or it will be silently
reverted by the cutover.

The eight packages today: `config`, `telemetry`, `docs-compiler`, `env`, `db`,
`brand`, `newsletter`, `events`. `airtable` was migrated in Wave 1 and later
dropped — the locked Airtable-removal redesign deleted it from the product
before it was ever published, so it never became a cutover concern; see git
history for that removal rather than a checklist item here. `events` moved
out of `DevDogsUGA` after Wave 1: `packages/events` (the meetings/workshops
config-as-code package) is deleted there, and its consumers — the platform
app's `server/config/reconcile.ts` and, as of the vinext-era redesign,
`packages/devtools` too — both import the published `@devdogsuga/events`
package.

## The local-pack bridge

Before the first real npm publish exists, `pnpm pack:local` (see
`scripts/pack-local.mjs`) builds every publishable package and packs each into
a stable-named, gitignored tarball under `.packs/` — e.g.
`.packs/devdogsuga-db.tgz`. `DevDogsUGA` points pnpm `overrides` at these
tarballs (a `file:` path into this checkout) to consume Backstage's packages
today, without waiting on section A below. `pnpm pack` rewrites every
`catalog:`/`workspace:*` specifier into the resolved version, so a tarball
built this way is byte-for-byte what a real publish would produce for that
package.json — this is a bridge, not a substitute for testing the real
pipeline once it exists (see section C's note on that).

---

## A. Sloan-only, outside any repo

These are the actual blockers; nothing below them can be verified until they
are done.

- [ ] Claim the `@devdogsuga` org on npmjs.com.
- [ ] Create the GitHub remote for `Backstage` and push `main`.
- [ ] First publish of each of the 8 packages. Trusted Publishing is configured
      *on an existing package*, so it cannot mint the first version — either do
      one manual `npm publish` per package from a maintainer's machine with a
      real token, or use npm's "pending trusted publisher" flow if it is
      available at the time. Check npm's current docs; this is the one step the
      pipeline cannot bootstrap itself.
- [ ] After each package exists: configure Trusted Publishing per package
      (npmjs.com → package → Settings → Publishing access → Trusted Publisher →
      GitHub Actions), pointing at `<owner>/Backstage`, workflow
      `.github/workflows/publish.yaml`, blank environment. **Per package, all
      eight** (`config`, `telemetry`, `docs-compiler`, `env`, `db`, `brand`,
      `newsletter`, `events`) — a missed one fails that package's publish and
      only that one.
- [ ] Branch protection on `main` (deferred out of Wave 1 deliberately).

## B. In `DevDogsUGA` (the consumer cutover — one branch)

> Done on DevDogsUGA branch `backstage-cutover` (unmerged), consuming these
> packages through the `.packs/` bridge. Only the first item remains:
> swapping the bridge for published versions once they exist.

- [ ] Add the 8 packages as real npm dependencies at their published versions,
      replacing the `.packs/`-tarball overrides documented above.
- [x] Delete the migrated `packages/*` from the product repo:
      `config`, `telemetry`, `docs-build`, `env`, `supabase`, `drizzle`,
      `newsletter`, `events`.
- [x] `docs-build` → `docs-compiler`: the package was **renamed** in the move.
      Every import of `@devdogsuga/docs-build` has to be retargeted. The `.`
      and `./gen` subpaths and all internals are unchanged, so it is a pure
      find-and-replace of the specifier.
- [x] `supabase` + `drizzle` → **one** package, `@devdogsuga/db`, under three
      subpaths. Nothing is exported from its root:
      - `@devdogsuga/supabase` browser/SSR helpers → `@devdogsuga/db/client`
      - `@devdogsuga/supabase` admin client + `@devdogsuga/drizzle` → `@devdogsuga/db/server`
      - type generation → `@devdogsuga/db/typegen`
- [x] The db client helpers are now **generic over `Database`**. Every call site
      has to supply the repo's own generated type as a type argument; it is no
      longer baked into the package. Expect this to be the largest single
      mechanical diff of the cutover.
- [x] Keep `database.types.ts` in `DevDogsUGA` and regenerate it there with
      `@devdogsuga/db/typegen`. It is generated repo data and deliberately does
      not ship in the package. Wire up whatever `db typegen` command the repo
      wants around `generateDatabaseTypes()`.
- [x] Keep `schemas.ts` (`SCHEMAS` / `AppKey` / `SchemaName`) in `DevDogsUGA` —
      the app→Postgres-schema map is business data. It can key its values off
      `DatabaseSchema<Database>` imported from `@devdogsuga/db/client`.
- [x] Retarget the RLS persona suite (`packages/supabase/testing/**`, which
      stays in `DevDogsUGA`) to import its clients from `@devdogsuga/db/client`
      and `@devdogsuga/db/server`. It exercises the product's real schema, so
      it never moved; only its imports change.
- [x] Apps drop their direct `@t3-oss/env-*` dependency and import
      `@devdogsuga/env/nextjs` instead. `apps/platform` and
      `apps/schedule-builder` are the two that depend on it directly today;
      the re-export exists precisely so the pin lives in one place.
- [x] `og` → `open-graph` rename, and make `og` consume `@devdogsuga/brand`
      for its tokens instead of defining its own. Today `brand` is an
      *extracted copy* of og's `brand.ts` / `event.ts` / `fonts.ts` /
      `oklch.ts` / `generated/` — **a token edit has to be made in both repos
      until this lands.** `og` itself was deliberately untouched in Wave 1.
- [x] `packages/newsletter` in the product repo imported og in `assets.ts` and
      `theme.ts` (`GDGC_UGA`, event chips from `@devdogsuga/og/event`). The
      Backstage copy already imports `@devdogsuga/brand` instead; confirm no
      og import survives anywhere once the product copy is deleted.
- [x] Re-run the full product test suite. Wave 1 verified these packages
      against *their own* tests, which is not the same as verifying the apps
      that consume them.

## C. In `Backstage`

- [ ] Wave 2, separately: devtools split + the §5 contract (dlx packaging,
      pnpm-exec spawning, optional-peer resolution, telemetry as a regular dep,
      two-tier preflight). Prototype-first per plan §8. Not started.
- [ ] `packages/db` ships no test of its own for the client/server factories —
      only `typegen` (2 tests). The suite that covered this code in the product
      repo was the live-DB RLS suite, which stayed behind. The factories are
      currently untested here.
- [ ] `vitest.rls.config.ts` is an empty lane (`passWithNoTests`) kept for
      parity. Either write a live-stack test for the factories or delete it.
- [ ] Verify the publish pipeline end-to-end on the first real push. It has
      **never executed** — no remote exists — and
      `scripts/publish-changed-packages.mjs` documents its own v1 limitations
      in its header. Treat the first run as untested code. `pnpm pack:local`
      exercises the packing half of that pipeline today (see "The local-pack
      bridge" above), but never the registry/OIDC half.
