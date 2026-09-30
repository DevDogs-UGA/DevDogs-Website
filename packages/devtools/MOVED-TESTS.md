# Tests moved out of the Backstage `devtools` copy — final disposition

Stage A1 (the devtools carve-out) found 12 tests/test-groups that inherently
checked DevDogsUGA's own repo structure or content — real `apps/*`/
`packages/*` directories, real env manifests, a real DevDogsUGA CLI
subprocess, or real `@devdogsuga/open-graph`/`@devdogsuga/email` templates
(both `"private": true`, staying in DevDogsUGA — see the carve-out plan's
ledger). None of that existed inside the Backstage checkout at the time, so
none of them could pass here regardless of mocking effort, and all 12 were
deleted from this package rather than left broken.

A later review (the "Wave 2 gaps" pass) went through all 12 and gave each one
a final home:

- **7 were unit-testing devtools' OWN internals**, not DevDogsUGA's content —
  `cron/discovery.test.ts`, `env/commands.target.test.ts`,
  `env/commands.test.ts`, `env/example.test.ts`, `env/selection.test.ts`,
  `env/commands.audit.test.ts`, `gh/environments.test.ts`. **Restored into
  this package**, adapted to run against the committed contract-test fixture
  (`test/fixture-repo/`, extended with a `test/fixture-repo/packages/
demo-registry/` manifest — see that file's own header) instead of
  DevDogsUGA's real ~50-key registry, plus devtools' own operator manifest
  (`packages/devtools/env.ts`), which `env/discovery.ts` now loads
  unconditionally regardless of which repo devtools runs against (see that
  file's `ownManifestPath()`) — several of the restored tests lean on this
  directly (`gh/environments.test.ts`'s `SUPABASE_ACCESS_TOKEN`,
  `env/selection.test.ts`'s `BWS_ACCESS_TOKEN`/`DEV_VPN_HOST`).

  A few assertions inside these files did NOT survive the move, because their
  whole point was a fact about DevDogsUGA's own declared content rather than
  about devtools' routing/rendering mechanism. Each is called out in the
  restored file's own header; the short version:

  - `env/selection.test.ts`'s and `env/example.test.ts`'s exact
    `keysRoutedTo(...).size`/`target(...).active.size` pins (49/50/1 in the
    original) — restored as structural invariants ("production ⊇ staging by
    exactly the apply-tier count", "preflight is strictly smaller") instead
    of magic counts tied to DevDogsUGA's key inventory.
  - `env/example.test.ts`'s "drops the values that were wrong for a deployed
    target" — a named regression list over specific DevDogsUGA keys
    (`BASE_URL`, `GH_APP_PRIVATE_KEY`, `GOOGLE_CLIENT_ID`, …). Dropped
    entirely.
  - `env/example.test.ts`'s "the project picker's rendering" describe
    (`APP_SECTIONS` narrowing over `schedule-builder`/`study-group-finder`/
    `platform`/`sandbox`) — DevDogsUGA's real app topology. Only the
    registry-independent parts survive (`resolveSections`'s pure
    argument-parsing rules, and the `devtools` role toggle, which IS real
    content here).
  - `env/example.test.ts`'s "keeps the development defaults" (literal
    `http://localhost:3000`, `000000` placeholders) — DevDogsUGA-specific
    literals. Dropped.

  **These four belong to DevDogsUGA's own `repo-checks` (or a successor to
  `env/completeness.test.ts` there), not to devtools**: they are claims about
  DevDogsUGA's actual declared keys, counts, and app sections, which no
  fixture inside Backstage should try to reproduce byte-for-byte without
  duplicating DevDogsUGA's real content into this repo.

- **5 remain repo-structural/content tests that belong in DevDogsUGA**, not
  here — unchanged from the original assessment below: `src/workers.test.ts`,
  `src/cron/contract.test.ts`, `src/env/completeness.test.ts`,
  `src/deploy/cli-dispatch.test.ts`, and the partial move from
  `src/emails/commands.test.ts`. These assert facts about DevDogsUGA's real
  workspace tree, real `.github/workflows/*.yaml`, real env manifests byte
  for byte, or a real subprocess/template — not about devtools' behavior in
  the abstract. `packages/repo-checks` in DevDogsUGA is where they belong;
  `env/completeness.test.ts`'s `--check` byte-compare in particular is what
  DevDogsUGA's `pnpm devtools env example --check` CI step already covers at
  the process level.

Every entry below: the file's repo-relative path here before removal, what it
asserted, and what real-repo fixture it needs to run in DevDogsUGA.

## `src/workers.test.ts` — left to DevDogsUGA repo-checks

**Asserts:** `workers.json` (the one list of Worker apps) never drifts
from (1) an actual `wrangler.jsonc` under `apps/*`/`packages/*` that some
workspace package ships, and (2) `.github/workflows/deploy-app.yaml`'s
hand-written per-app deploy matrix.

**Needs:** the real DevDogsUGA workspace tree (`apps/*`, `packages/*`, each
package's `wrangler.jsonc` where present) and the real
`.github/workflows/deploy-app.yaml` file.

## `src/cron/contract.test.ts` — left to DevDogsUGA repo-checks

**Asserts:** every `apps/*/cloudflare/scheduled.ts` that exists exports a
`CRON_ROUTES` (required) validating against the cron contract shape, and an
optional `WORKFLOW_CRONS` validating against its own shape; apps with no
`scheduled.ts` (e.g. `sandbox`) are skipped, not failed.

**Needs:** the real `apps/*/cloudflare/scheduled.ts` files, dynamically
imported (this is exactly the kind of load `devtools cron list/run`
performs against a real checkout via `repo/tsx-loader.ts` in the shipped
package — this test just needs the real files to import).

## `src/env/completeness.test.ts` — left to DevDogsUGA repo-checks

**Asserts:** every declared env key is routed to at least one channel, the
generated `.env.example` matches the real registry byte for byte
(`--check`'s CI gate), and a handful of other registry/`.env.example`
cross-checks named in the file's own header.

**Needs:** the real registry populated from every real `apps/*/src/env.ts` /
`packages/*/env.ts` / `supabase/env.ts` manifest in DevDogsUGA
(`env/discovery.ts`'s `loadRegistry()`), and the real committed
`.env.example` to compare against. Its 3 assertions pinning the operator
manifest's presence in the registry (the "devtools — operator tooling"
section, its key set, `neverStoreKeys()`/`applyOnlyKeys()` including
`BWS_ACCESS_TOKEN`/`SUPABASE_ACCESS_TOKEN`) were weakened by stage B when
devtools stopped being a workspace package; restoring them is DevDogsUGA
`repo-checks`' job, now that `env/discovery.ts` always loads devtools' own
manifest again.

## `src/deploy/cli-dispatch.test.ts` — left to DevDogsUGA repo-checks

**Asserts:** the `deploy` command group's process contract — nothing
decorative (clack's `intro`/`outro`/`log.*`/spinner) reaches stdout, only
the deploy protocol does — driven through a real subprocess of the CI bin.

**Needs:** a real DevDogsUGA checkout to spawn the CI bin against (the
file's own header explains why this has to be an actual subprocess, not an
in-process call). Should exercise both `devtools-ci` and the new
`devtools-ci-bare` entry point (see this package's `bin/devtools-ci-bare.mjs`
— added for the deploy workflows' no-tier-resolution steps).

## `src/cron/discovery.test.ts` — RESTORED, `src/cron/discovery.test.ts`

**Asserted:** `discoverWranglerConfigs`/`parseWrangler` correctly enumerate
and parse real `wrangler.jsonc` files.

**Restored against:** the committed contract-test fixture
(`test/fixture-repo/`, which ships one app, `demo-app`, with a real
`wrangler.jsonc`), via `DEVTOOLS_TEST_REPO_ROOT`. Same assertion
("discovered by presence of the file, not an allowlist"), one real app
instead of DevDogsUGA's four.

## `src/env/commands.target.test.ts` — RESTORED, `src/env/commands.target.test.ts`

**Asserted:** each of `init`/`pull`/`push`/`audit` reads/writes the FILE the
per-target table says it should (the `--env`/`--target` bug this test suite
exists to pin down).

**Restored against:** the fixture repo's `demo-registry` manifest
(`DEMO_TOKEN`, an ordinary secret; `DEMO_NARROWED_SECRET`, `narrowed: true`
— stand-ins for the original's `DISCORD_TOKEN`/`DB_URL`). `PROJECT_ROOT`
(the original's fixed-path constant) no longer exists; this file resolves
paths through `findRepoRoot()` instead.

## `src/env/commands.test.ts` — RESTORED, `src/env/commands.test.ts` (verbatim)

**Asserted:** `pushToGithub` and friends route each key to the correct
GitHub secret-vs-variable store.

**Restored verbatim** — every assertion routes by TARGET NAME and explicit
argument maps, never by a registry lookup, except `SUPABASE_ACCESS_TOKEN`'s
`tier: "apply"` classification, which comes from devtools' own
always-loaded operator manifest.

## `src/env/example.test.ts` — RESTORED, `src/env/example.test.ts` (partial)

**Asserted:** `env init`'s renderer never writes a value that would be wrong
for a deployed target, and several other rendering invariants, against the
REAL DevDogsUGA registry.

**Restored against:** the fixture repo's `demo-registry` manifest plus
devtools' own operator manifest. See this file's own header for the full
list of what did and did not survive the move — the mechanism-level
invariants (blanks/derivations only, nothing invented, no line over an empty
section, committed/developer/minted/never-store exclusion, the preflight
narrowing, additive `init`) are restored; the DevDogsUGA-topology-specific
assertions (named regression list, exact key counts, `APP_SECTIONS`
narrowing, literal localhost defaults) are left to DevDogsUGA repo-checks.

## `src/gh/environments.test.ts` — RESTORED, `src/gh/environments.test.ts` (verbatim)

**Asserted:** `accepts`/`acceptedBy`/`acceptsKey`/`githubTargets`/`routeTo`
correctly classify keys into the `applyOnly`/`planOnly`/etc. sets the
reviewer gate depends on.

**Restored near-verbatim** — every function under test routes by a bare key
STRING and target name, never by a registry lookup, except
`applyOnlyKeys()` itself, which now comes from devtools' own always-loaded
operator manifest (`SUPABASE_ACCESS_TOKEN`, matching the original's literal).

## `src/env/selection.test.ts` — RESTORED, `src/env/selection.test.ts`

**Asserted:** `selectForPush`/`keysRoutedTo` correctly classify declared
keys into push/variables/skipped/derived/refused/unknown.

**Restored against:** the fixture repo's `demo-registry` manifest (an
ordinary secret, a narrowed one, a public per-environment variable, two
`localStack` ones, a committed constant, a minted credential, a derived
value, an apply-adjacent ordinary secret) plus devtools' own operator
manifest for `BWS_ACCESS_TOKEN`/`SUPABASE_ACCESS_TOKEN`/`DEV_VPN_HOST`. The
"leaves staging and production untouched" exact-count assertion (49/50/1 in
the original) is restored as a structural invariant instead — see the test
file's own note.

## `src/env/commands.audit.test.ts` — RESTORED, `src/env/commands.audit.test.ts`

**Asserted:** `env audit`'s drift report against the REPOSITORY's own real
variables.

**Restored against:** the fixture repo's `demo-registry` manifest
(`DEMO_VARIABLE`/`DEMO_TOKEN` standing in for the original's
`PROJECT_REF`/`CRON_SECRET`) plus `SUPABASE_ACCESS_TOKEN`, unchanged, from
devtools' own operator manifest.

## Partial move: `src/emails/commands.test.ts` — left to DevDogsUGA repo-checks

Not a whole-file move — only the `describe("email preview generation")`
block (the `generateEmails` round-trip: renders `TeamInvite`, checks the
HTML/text output contains real copy like "Byte Bulldogs"). The rest of the
file (`parseEmailArgs`/`destination`, pure argument parsing) stayed and
still passes.

**Needs:** the real `@devdogsuga/email` compiled templates
(`"private": true`, stays in DevDogsUGA — devtools now loads it via
`repo/source.ts`'s `loadEmail()`, which needs the real package resolvable
from a real DevDogsUGA checkout).
