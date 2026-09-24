# Tests moved out of the Backstage `devtools` copy

Stage A1 (the devtools carve-out) found tests that inherently check
DevDogsUGA's own repo structure or content — real `apps/*`/`packages/*`
directories, real env manifests, a real DevDogsUGA CLI subprocess, or real
`@devdogsuga/open-graph`/`@devdogsuga/email` templates (both `"private":
true`, staying in DevDogsUGA — see the carve-out plan's ledger). None of
that exists inside the Backstage checkout, so these tests cannot pass here
regardless of mocking effort. They were deleted from this package rather
than left broken; stage B re-homes them inside DevDogsUGA once devtools is
consumed there as a package.

Every entry: the file's repo-relative path here before removal, what it
asserted, and what real-repo fixture it needs to run.

## `src/workers.test.ts`

**Asserts:** `workers.json` (the one list of Worker apps) never drifts
from (1) an actual `wrangler.jsonc` under `apps/*`/`packages/*` that some
workspace package ships, and (2) `.github/workflows/deploy-app.yaml`'s
hand-written per-app deploy matrix.

**Needs:** the real DevDogsUGA workspace tree (`apps/*`, `packages/*`, each
package's `wrangler.jsonc` where present) and the real
`.github/workflows/deploy-app.yaml` file. Per the Wave 2 decisions notes,
this file's two `deploy.yaml`-vs-`deploy-app.yaml` failures are stale and
should be fixed as part of re-homing it in stage B.

## `src/cron/contract.test.ts`

**Asserts:** every `apps/*/cloudflare/scheduled.ts` that exists exports a
`CRON_ROUTES` (required) validating against the cron contract shape, and an
optional `WORKFLOW_CRONS` validating against its own shape; apps with no
`scheduled.ts` (e.g. `sandbox`) are skipped, not failed.

**Needs:** the real `apps/*/cloudflare/scheduled.ts` files, dynamically
imported (this is exactly the kind of load `devtools cron list/run`
performs against a real checkout via `repo/tsx-loader.ts` in the shipped
package — this test just needs the real files to import).

## `src/env/completeness.test.ts`

**Asserts:** every declared env key is routed to at least one channel, the
generated `.env.example` matches the real registry byte for byte
(`--check`'s CI gate), and a handful of other registry/`.env.example`
cross-checks named in the file's own header.

**Needs:** the real registry populated from every real `apps/*/src/env.ts` /
`packages/*/env.ts` / `supabase/env.ts` manifest in DevDogsUGA
(`env/discovery.ts`'s `loadRegistry()`), and the real committed
`.env.example` to compare against.

## `src/deploy/cli-dispatch.test.ts`

**Asserts:** the `deploy` command group's process contract — nothing
decorative (clack's `intro`/`outro`/`log.*`/spinner) reaches stdout, only
the deploy protocol does — driven through a real subprocess of the CI bin.

**Needs:** a real DevDogsUGA checkout to spawn `tsx`/the CI bin against
(the file's own header explains why this has to be an actual subprocess,
not an in-process call).

## `src/cron/discovery.test.ts`

**Asserts:** `discoverWranglerConfigs`/`parseWrangler` correctly enumerate
and parse real `wrangler.jsonc` files.

**Needs:** `readdirSync(join(PROJECT_ROOT, "apps"), …)` over the real
`apps/*` tree — walks real app directories rather than a fixture the test
constructs itself.

## `src/env/commands.target.test.ts`

**Asserts:** each of `init`/`pull`/`push`/`audit` reads/writes the FILE the
real per-target table says it should (the `--env`/`--target` bug this test
suite exists to pin down — see its header).

**Needs:** `beforeAll(async () => { await loadRegistry(); })` — the real
registry from every real manifest in DevDogsUGA, plus the real
`@devdogsuga/env` target table (`fileFor`/target-to-file mapping) it
asserts against by real file path.

## `src/env/commands.test.ts`

**Asserts:** `pushToGithub` and friends route each key to the correct
GitHub secret-vs-variable store, using the real registry to decide the
routing.

**Needs:** `beforeAll(async () => { await loadRegistry(); })` — same real
manifests as `commands.target.test.ts`.

## `src/env/example.test.ts`

**Asserts:** `env init`'s renderer never writes a value that would be wrong
for a deployed target from the REAL registry (the file's header describes
the two silent-failure modes this guards).

**Needs:** the real registry (`loadRegistry()`), asserting over real
manifest declarations rather than a synthetic one — this is the intentional
counterpart to `env/example.synthetic.test.ts` (kept — see that file's own
header for why the synthetic cases exist separately).

## `src/gh/environments.test.ts`

**Asserts:** `accepts`/`acceptedBy`/`acceptsKey`/`githubTargets`/`routeTo`
correctly classify real declared keys into the `applyOnly`/`planOnly`/etc.
sets the reviewer gate depends on.

**Needs:** `beforeAll(async () => { await loadRegistry(); })` — the real
registry, and asserts real key names (`BWS_ACCESS_TOKEN` et al.) by name.

## `src/env/selection.test.ts`

**Asserts:** `selectForPush`/`keysRoutedTo` correctly classify real
declared keys into push/variables/skipped/derived/refused/unknown.

**Needs:** `beforeAll(async () => { await loadRegistry(); })` — same real
registry dependency as the other `env/*` movers.

## `src/env/commands.audit.test.ts`

**Asserts:** `env audit`'s drift report against the REPOSITORY's own real
variables (not a synthetic set).

**Needs:** `beforeAll(async () => { await loadRegistry(); })` — the real
registry.

## Partial move: `src/emails/commands.test.ts`

Not a whole-file move — only the `describe("email preview generation")`
block (the `generateEmails` round-trip: renders `TeamInvite`, checks the
HTML/text output contains real copy like "Byte Bulldogs"). The rest of the
file (`parseEmailArgs`/`destination`, pure argument parsing) stayed and
still passes.

**Needs:** the real `@devdogsuga/email` compiled templates
(`"private": true`, stays in DevDogsUGA — devtools now loads it via
`repo/source.ts`'s `loadEmail()`, which needs the real package resolvable
from a real DevDogsUGA checkout). Re-add this case in DevDogsUGA alongside
the kept ones once devtools is re-homed there.
