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
see "The local-pack bridge (retired)" below for how `DevDogsUGA` consumed these packages
in the meantime.

Migrated from `DevDogsUGA@2165a7230e51fc922a3b37de51450f4f6c37a699`, and kept
forward-ported up to `DevDogsUGA@e5f8737ad004ecffadf5ac0a4f2072cd855ac3c7`.
Anything merged into those packages in the product repo after that sha has to
be forward-ported before the consumer switches over, or it will be silently
reverted by the cutover.

The eight packages at cutover: `config`, `telemetry`, `docs-compiler`, `env`,
`db`, `brand`, `newsletter`, `events`. `docs-compiler` has since moved to
DevDogsUGA as `@devdogsuga/docs-kit` and is gone from this repo. `airtable` was migrated in Wave 1 and later
dropped — the locked Airtable-removal redesign deleted it from the product
before it was ever published, so it never became a cutover concern; see git
history for that removal rather than a checklist item here. `events` moved
out of `DevDogsUGA` after Wave 1: `packages/events` (the meetings/workshops
config-as-code package) is deleted there, and its consumers — the platform
app's `server/config/reconcile.ts` and, as of the vinext-era redesign,
`packages/devtools` too — both import the published `@devdogsuga/events`
package.

Since then two CLIs and a headers package joined them: `devtools`,
`backstage` (new, TASK-399) and `headers`. `cli-core` is the private shared core
both CLIs inline with `tsdown`; `scripts/publish-changed-packages.mjs` skips it
because it is `private`, and `scripts/check-bundle-imports.mjs` (run by both
CLIs' `build`) fails the build if either bundle still imports it or any other
undeclared package. `backstage` has never been on npm, so its first publish is
done by hand (then configure its Trusted Publisher like the others); the
script would pick it up on a run and publish it at `0.1.0`.

The `devtools-ci` and `devtools-ci-bare` bins, the `db`/`cf`/`gen`/`emails`/
`grant-root` aliases and the `./ci-alias` source entry are removed here: the
DevDogsUGA cutover branch (TASK-403) stops calling all of them, so publish this
only together with that push.

## The local-pack bridge (retired)

`pnpm pack:local` and `scripts/pack-local.mjs`, which packed every package into
`.packs/` for DevDogsUGA's `overrides` to consume before the first npm publish,
were deleted once packages were published. Git history has them.

---

## A. Sloan-only, outside any repo

These are the actual blockers; nothing below them can be verified until they
are done.

- [ ] Claim the `@devdogsuga` org on npmjs.com.
- [ ] Create the GitHub remote for `Backstage` and push `main`.
- [ ] First publish of each of the 8 packages, and of `backstage` (the others are already on npm). Trusted Publishing is configured
      _on an existing package_, so it cannot mint the first version — either do
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
      subpaths. Nothing is exported from its root: - `@devdogsuga/supabase` browser/SSR helpers → `@devdogsuga/db/client` - `@devdogsuga/supabase` admin client + `@devdogsuga/drizzle` → `@devdogsuga/db/server` - type generation → `@devdogsuga/db/typegen`
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
      _extracted copy_ of og's `brand.ts` / `event.ts` / `fonts.ts` /
      `oklch.ts` / `generated/` — **a token edit has to be made in both repos
      until this lands.** `og` itself was deliberately untouched in Wave 1.
- [x] `packages/newsletter` in the product repo imported og in `assets.ts` and
      `theme.ts` (`GDGC_UGA`, event chips from `@devdogsuga/og/event`). The
      Backstage copy already imports `@devdogsuga/brand` instead; confirm no
      og import survives anywhere once the product copy is deleted.
- [x] Re-run the full product test suite. Wave 1 verified these packages
      against _their own_ tests, which is not the same as verifying the apps
      that consume them.

## C. In `Backstage`

- [x] Wave 2, stage A1: `packages/devtools` moved here as a publishable
      package, refactored off the assumption that it lives inside
      DevDogsUGA. Landed on Backstage `main`. What A1 did: - `findRepoRoot()` (`src/repo/root.ts`) replaces both `PROJECT_ROOT`
      and `REPO_ROOT`: walks up from `process.cwd()` for the
      `pnpm-workspace.yaml` + `package.json.name === "devdogs-monorepo"`
      marker (per the devtools-dlx prototype's FINDINGS.md, experiment 1).
      Lazy and memoized; throws a clear `RepoNotFoundError` ("run this
      from inside a DevDogsUGA clone") when not found. - `resolveFromRepo`/`findDependent` (`src/repo/resolve.ts`), with unit
      tests, per FINDINGS' recommended contract — including the subpath
      gotcha found while smoke-testing (`@devdogsuga/env/load` needs
      `findDependent` to search on the PACKAGE name, not the literal
      specifier). - Every `@devdogsuga/*` import classified and converted to a dynamic,
      repo-resolved load: `env`/`db`/`brand`/`newsletter` as optional
      peers (`src/repo/peers.ts`); `open-graph`/`email`/`docs` as
      repo-local `devdogs-source`-condition loads (`src/repo/source.ts`,
      via `src/repo/tsx-loader.ts`); `telemetry` stays a regular
      dependency, the one exception. `open-graph`/`email` have no real
      types in Backstage (private, stay in DevDogsUGA) — hand-maintained
      type shims live in `src/images/open-graph-types.ts` and
      `src/emails/email-types.ts`. - Ships built JS (`tsc` to `dist/`); both bins (`devtools`,
      `devtools-ci`) run `dist/` directly via plain `node`, no `tsx`
      wrapper. `tsx` is a runtime dependency used only programmatically to
      load the target repo's own TypeScript. - 11 tests that read real DevDogsUGA repo content (real manifests,
      real `apps/*`, a real CLI subprocess) moved out —
      `packages/devtools/MOVED-TESTS.md` lists each with what it asserted
      and what it needs; stage B re-homes them. Everything else (615
      tests) passes here. - Verified with a real `pnpm pack:local` tarball installed and run
      against the read-only `DevDogsUGA-cutover` worktree: `--help`,
      `cron list` (loads real cron contracts via tsx), `env example
      --check` (loads every real env manifest + the peer-resolved
      `@devdogsuga/env`), `images --all-formats --dry-run` and `emails
      '*' --dry-run` (both load real `open-graph`/`email` content), `db
      status`, `devtools-ci deploy --help` — from the repo root, from
      `apps/platform`, and (for the "clear error" case) from `/tmp`. The
      worktree stayed clean (`git status --short`) through every run. - Known gaps, left for stage A2 or later: `setup`/`--help` still
      require being inside a real repo end-to-end — a few modules
      (`workers.ts`'s `workers.json` read, `db/seed-roles.ts`'s seed-file
      path, `commands.ts`'s `WORKER_APPS`-derived `--app` choices) resolve
      `findRepoRoot()` eagerly at module load, which the original in-repo
      devtools never had to guard against (its old `PROJECT_ROOT` could
      never throw). No dlx preflight/self-refresh, no minimums manifest,
      no contract-test fixture repo — all explicitly out of A1's scope.
- [x] Wave 2, stage A2: dlx preflight + self-refresh, `newsletter` moved to
      a Backstage script, contract tests against a fixture repo. Landed on
      Backstage `main`. What A2 did: - **Preflight + self-refresh** (`packages/devtools/src/repo/
      preflight.ts`, wired into `launch()` so it runs on every `devtools`
      command — never `devtools-ci`, which still pins an exact version on
      purpose and never imports this module at all). Fetches a
      zod-validated `{ devtools: { latest, minimum } }` manifest from
      DevDogsUGA's `main` branch (`DEVTOOLS_MINIMUMS_URL` overridable,
      defaulting to
      `https://raw.githubusercontent.com/DevDogsUGA/DevDogsUGA/main/devtools-minimums.json`),
      ~1.5s timeout, fails open on any error. Disk cache under
      `$XDG_CACHE_HOME/devdogsuga-devtools/` (`~/.cache` fallback), 10
      minutes — short on purpose, so a hotfix's dropped `minimum` reaches
      a contributor within one coffee break rather than the plan's
      original "a few hours". Below minimum: re-execs as `pnpm dlx
      @devdogsuga/devtools@<latest>` with an EXACT version spec (load-
      bearing per the devtools-dlx prototype's FINDINGS.md experiment
      6d), stdio inherited, exit code propagated, env loop guard. Below
      latest but at/above minimum: one-line stderr nudge.
      `--skip-preflight`/`DEVTOOLS_SKIP_PREFLIGHT=1` bypass entirely;
      `--refresh` bypasses the disk cache and forces the re-exec target
      to `latest`. Dev-mode skip (version `0.0.0-dev`, or — the real-
      world default — the package's own directory not sitting under any
      `node_modules`, i.e. a workspace checkout rather than a published
      install). - **Lazy repo root**: `workers.ts`, `db/seed-roles.ts`,
      `commands.ts`'s `WORKER_APP_CHOICES` (plus `gen/hypno.ts`, found
      the same way while verifying `--help`) all made lazy/memoized.
      `devtools --help` and `devtools setup` now work from `/tmp`;
      `setup` outside a repo runs its prerequisite checks and points at
      `git clone` instead of throwing, per §5 "works pre-clone". Every
      other repo-dependent command outside a repo still refuses with the
      same `RepoNotFoundError` message, now caught cleanly in
      `launch()`'s tier-resolution branch instead of an uncaught stack
      trace. - **`newsletter` moved out of devtools**, into the new (private,
      never-published) `packages/newsletter-cli` — run as `pnpm
      newsletter …` from a Backstage checkout. Ported verbatim (commands,
      imap, smtp, oauth, loopback, and their tests), with the newsletter-
      package import switched from devtools' dynamic repo-peer resolution
      to a direct static import of the workspace sibling
      `@devdogsuga/newsletter`. No credential migration was actually
      needed: the module reads no env vars for a secret — auth is an
      interactive OAuth browser sign-in as the club mailbox (borrowing
      Thunderbird's allowlisted app registration), with the refresh token
      cached at `~/.config/devdogsuga/newsletter-mailbox.json`, already
      outside any repo. See that package's README.
      `@devdogsuga/newsletter` dropped from devtools' `peerDependencies`. - **Contract tests** (`packages/devtools/test/contract/`,
      `pnpm test:contract`, separate from the default `pnpm test` since a
      real `pnpm install` per run is slow): a committed fixture repo
      (`test/fixture-repo/`) — the repo-root marker, `workers.json`, an
      app with a `wrangler.jsonc` cron and a real `scheduled.ts`, a
      package with a real `env.ts` manifest, a stub `devdogs-source`
      package. The suite `pnpm pack`s devtools/telemetry/env, points a
      temp copy's `pnpm-workspace.yaml` `overrides` at the tarballs, and
      runs the real bin for `--help` (in-repo and outside any repo),
      `cron list`, `env example` (real module identity), root discovery
      from a subdirectory, the not-in-repo refusal, and four preflight
      cases (fail-open, nudge, `--skip-preflight`, the re-exec decision).
      Wired into `.github/workflows/ci.yaml` and `.github/workflows/
      publish.yaml` (before the patch-bump+publish step). - Added a hidden `devtools version` command (prints the running
      build's version to clean stdout) — mostly for confirming a
      self-refresh actually landed; not in the command tree, same
      treatment as the `deploy` redirect. - **dlx bridge, proven against a local Verdaccio**
      (`/home/sloan/scratchpad/devdogs/prototypes/devtools-dlx/verdaccio-conf/`,
      `@devdogsuga/*` has no uplink): publishing `@devdogsuga/telemetry`
      and `@devdogsuga/devtools` there (both via `pnpm pack` tarballs,
      NOT `npm publish` directly from source — the latter leaves
      `catalog:`/`workspace:*` specifiers unresolved, which pnpm's
      installer then refuses as "not supported by any resolver" for an
      external package) and running:
      `       pnpm dlx --config.registry=http://localhost:4873 @devdogsuga/devtools@<version> <args…>
      `
      from inside the `DevDogsUGA-cutover` worktree works end to end —
      proved with `cron list --tier development` (`DEV_DB=local`),
      listing the worktree's real cron schedules, worktree staying clean
      throughout. (The alternative `pnpm dlx --package=file:…
      --package=file:… devtools …` bridge fails for the same reason:
      `@devdogsuga/telemetry`'s declared dependency on `@devdogsuga`-
      published tarballs still isn't resolvable without either a
      registry or a `pnpm.overrides`/`pnpm-workspace.yaml overrides`
      entry pnpm actually reads — the registry route is the one that
      works with no extra flags.) **Post-publish, this collapses to**
      `pnpm dlx @devdogsuga/devtools` (no `--config.registry` — the
      default registry resolves `@devdogsuga` once the real npm org is
      claimed and packages are published there). - **End-to-end self-refresh, proven**: published devtools `0.1.0` and
      `0.1.1` to the same Verdaccio, served a `devtools-minimums.json`
      (`{ "devtools": { "latest": "0.1.1", "minimum": "0.1.1" } }`) from a
      throwaway local static server, and ran (from the cutover worktree,
      `DEV_DB=local`):
      `       DEVTOOLS_MINIMUMS_URL=<manifest url> DEVTOOLS_REGISTRY=http://localhost:4873 \
        pnpm dlx --config.registry=http://localhost:4873 @devdogsuga/devtools@0.1.0 version --tier development
      `
      Printed `devtools: 0.1.0 is below the minimum supported version —
      relaunching as 0.1.1...`, re-exec'd via `pnpm dlx
      @devdogsuga/devtools@0.1.1`, and the final line printed was `0.1.1`
      — the exact version the manifest named as latest. Worktree stayed
      clean throughout (the "Added N entries to minimumReleaseAgeExclude"
      message pnpm prints is in-memory only, confirmed via `git status
      --short` and an unchanged `pnpm-workspace.yaml`). - Known gaps, left for stage B or later: no CI actually runs any of
      this yet (no remote); `devtools-ci`'s "exact pinned version" story
      (§9) has no automated check that a deploy workflow's pin stays in
      sync with what's published — a manual/documentation concern for
      now. - **2026-09-27: preflight + self-refresh removed.** Its premise — a
      bare `pnpm dlx` serves a stale cached copy — no longer holds on
      pnpm 11.8 (the pinned `packageManager`): dlx resolves the `latest`
      dist-tag on every run and caches per resolved version (verified:
      `0.1.8` published 16:49 was picked up by a default-settings run at
      16:56 despite `0.1.7` cached at 14:00), and `@devdogsuga/*` is
      excluded from `minimumReleaseAge`. `ownVersion` moved to
      `src/version.ts`; everything else described above (`repo/
      preflight.ts`, `--skip-preflight`/`--refresh`,
      `DEVTOOLS_MINIMUMS_URL`/`DEVTOOLS_REEXEC_GUARD`, the contract
      suite's four preflight cases) is gone.
- [ ] Stage B: re-home the 11 tests `packages/devtools/MOVED-TESTS.md`
      lists, once devtools is consumed as a package inside DevDogsUGA.
- [x] `packages/db` now has mocked unit tests for the client/server
      factories (`src/client/index.test.ts`, `src/server/index.test.ts`),
      covering schema/cookie pass-through, the admin client's disabled
      session persistence, and `createDb`'s connection caching — no live DB.
      `vitest.rls.config.ts` was deleted (with its `test:rls` script and the
      stale CI comment example): the RLS persona suite stayed in DevDogsUGA
      per the note above, so there was never going to be a live-DB suite of
      this package's own to grow into that lane.
- [ ] Verify the publish pipeline end-to-end on the first real push. It has
      **never executed** — no remote exists — and
      `scripts/publish-changed-packages.mjs` documents its own v1 limitations
      in its header. Treat the first run as untested code. The
      packing half is exercised by the devtools contract tests; nothing
      exercises the registry/OIDC half.
