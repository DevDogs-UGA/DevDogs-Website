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
precondition list — it is inert until then.

Migrated from `DevDogsUGA@2165a7230e51fc922a3b37de51450f4f6c37a699`. Anything
merged into those packages in the product repo after that sha has to be
forward-ported before the consumer switches over, or it will be silently
reverted by the cutover.

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
      eight** — a missed one fails that package's publish and only that one.
- [ ] Branch protection on `main` (deferred out of Wave 1 deliberately).
- [ ] Decide the `@devdogsuga/airtable` disclosure question in section D.

## B. In `DevDogsUGA` (the consumer cutover — one branch)

- [ ] Add the 8 packages as real npm dependencies at their published versions.
- [ ] Delete the migrated `packages/*` from the product repo:
      `config`, `telemetry`, `docs-build`, `env`, `supabase`, `drizzle`,
      `newsletter`, `airtable`.
- [ ] `docs-build` → `docs-compiler`: the package was **renamed** in the move.
      Every import of `@devdogsuga/docs-build` has to be retargeted. The `.`
      and `./gen` subpaths and all internals are unchanged, so it is a pure
      find-and-replace of the specifier.
- [ ] `supabase` + `drizzle` → **one** package, `@devdogsuga/db`, under three
      subpaths. Nothing is exported from its root:
      - `@devdogsuga/supabase` browser/SSR helpers → `@devdogsuga/db/client`
      - `@devdogsuga/supabase` admin client + `@devdogsuga/drizzle` → `@devdogsuga/db/server`
      - type generation → `@devdogsuga/db/typegen`
- [ ] The db client helpers are now **generic over `Database`**. Every call site
      has to supply the repo's own generated type as a type argument; it is no
      longer baked into the package. Expect this to be the largest single
      mechanical diff of the cutover.
- [ ] Keep `database.types.ts` in `DevDogsUGA` and regenerate it there with
      `@devdogsuga/db/typegen`. It is generated repo data and deliberately does
      not ship in the package. Wire up whatever `db typegen` command the repo
      wants around `generateDatabaseTypes()`.
- [ ] Keep `schemas.ts` (`SCHEMAS` / `AppKey` / `SchemaName`) in `DevDogsUGA` —
      the app→Postgres-schema map is business data. It can key its values off
      `DatabaseSchema<Database>` imported from `@devdogsuga/db/client`.
- [ ] Retarget the RLS persona suite (`packages/supabase/testing/**`, which
      stays in `DevDogsUGA`) to import its clients from `@devdogsuga/db/client`
      and `@devdogsuga/db/server`. It exercises the product's real schema, so
      it never moved; only its imports change.
- [ ] Apps drop their direct `@t3-oss/env-*` dependency and import
      `@devdogsuga/env/nextjs` instead. `apps/platform` and
      `apps/schedule-builder` are the two that depend on it directly today;
      the re-export exists precisely so the pin lives in one place.
- [ ] Delete `apps/platform/src/server/airtable/officerChangeCommand.ts` and its
      test, and import `@devdogsuga/airtable/officer-change` instead.
      **Until this is done the grammar exists in two places** — accepted
      temporary duplication, but it is duplication of a *treaty* (what an
      Airtable form response means), which is the worst kind to let drift.
      The moved copy takes an id→email resolver as an argument rather than
      importing `myIdToEmail`; platform supplies its own MyID→`@uga.edu` rule
      at the call site. Applying a command (receipts, leases, refusals,
      Postgres effects, account creation) stays in platform and did not move.
- [ ] `og` → `open-graph` rename, and make `og` consume `@devdogsuga/brand`
      for its tokens instead of defining its own. Today `brand` is an
      *extracted copy* of og's `brand.ts` / `event.ts` / `fonts.ts` /
      `oklch.ts` / `generated/` — **a token edit has to be made in both repos
      until this lands.** `og` itself was deliberately untouched in Wave 1.
- [ ] `packages/newsletter` in the product repo imported og in `assets.ts` and
      `theme.ts` (`GDGC_UGA`, event chips from `@devdogsuga/og/event`). The
      Backstage copy already imports `@devdogsuga/brand` instead; confirm no
      og import survives anywhere once the product copy is deleted.
- [ ] The generated files in `brand/src/generated/` still carry the header
      `Run \`pnpm --filter @devdogsuga/og generate\` to refresh` — a command
      that now lives in a *different repo* from the file it writes. Either move
      the generator into Backstage alongside the assets, or change the header
      to say which repo to run it in. As written it is a trap.
- [ ] Re-run the full product test suite. Wave 1 verified these packages
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
      in its header. Treat the first run as untested code.

## D. Decision needed: `@devdogsuga/airtable` publishes club data

Flagging this because it was not covered by the build sheet's exclusion rule
and nobody has explicitly decided it.

The build sheet's rule was "no generated repo data", and it named
`database.types.ts`. It did not name these, and the airtable work order said
"copy the package", so Wave 1 copied them as-is:

- `packages/airtable/schema-snapshot.json` ships in the tarball — the
  committed snapshot of the club's real Airtable base: table ids, field ids,
  field names, and every `singleSelect` choice.
- `packages/airtable/src/registry.ts` hardcodes `BASE_ID = "appt422RNi98uAqwX"`.

`publishConfig.access` is `public`, so this goes to the public registry. Both
are load-bearing — `src/snapshot.ts` reads the snapshot and `verify`/`pull`/
`push` are built on the registry — so this is not a file that can just be
deleted without redesigning the package.

None of it is a credential; an Airtable base id and field ids are useless
without an API key. But it is a public, permanent, machine-readable
description of the club's internal base, and npm tarballs cannot be
un-published after 72 hours.

Pick one before first publish:

- [ ] **Accept** — decide this is fine, and note it so it isn't rediscovered as
      a surprise later.
- [ ] **Keep it private** — `publishConfig.access: "restricted"` for this one
      package. Cheapest fix; needs a paid npm org.
- [ ] **Split** — `@devdogsuga/airtable` keeps the generic client/DSL/push/pull
      machinery, and the registry + snapshot move to a private package or stay
      in `DevDogsUGA`. Cleanest, most work, and the only option that makes the
      published package genuinely reusable by anyone else.
