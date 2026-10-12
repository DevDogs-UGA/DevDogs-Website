# catalog

The UGA course catalog as a public, read-only API, and the scrape that fills it.

- **API.** `https://api.devdogsuga.org/catalog/v1/*` (staging:
  `api-staging.devdogsuga.org`). Terms with drop/add end dates, subjects, search,
  course detail, course-exists, and sections for up to 15 courses at a time. No
  authentication. The contract is [`openapi/catalog.yaml`](./openapi/catalog.yaml);
  the Worker is written against it and its tests fail when the two disagree.
- **Scrape.** `ScrapeWorkflow` reads the registrar's schedule files every day
  (14:05 UTC) and reconciles them into the `schedule_builder` tables.
  `ProgramsWorkflow` mirrors the UGA Bulletin's programs into
  `platform."academicPrograms"` (14:35 UTC). Both moved here from
  schedule-builder and the platform's nightly cron.
- **Buildings.** The coordinates dataset in [`data/buildings/`](./data/buildings/README.md),
  imported at the start of every scrape.

DogDays, DogPack and anything else read the catalog through this API (the base
URL comes from their environment); only this Worker writes the data.

## How a request is answered

`src/api/router.ts`: method check, route and parameter validation (a bad request
is a `400` before it costs a database call), per-IP rate limit (`429` with
`Retry-After`: 120 requests a minute, 60 on `/search`), the edge cache (5 minutes;
the scrape is daily), then one read-only transaction.

The read runs as the **`catalog_reader`** role (migration 62): `set local role`
inside a `READ ONLY` transaction with a 3 second `statement_timeout`. The role can
see the views in the `uga` schema (migration 63) and nothing else, so even a
mistake in a query cannot write or read another schema. A timeout is a `503`.

The optional `X-Client` header (`dogdays/1.4`) is tagged on Sentry events for
usage numbers; it changes no answer.

## How a scrape runs

One Workflow step per term, each retried and checkpointed by the Workflows
engine, so one term's failure cannot sink the others:

1. `detect-available-terms`: which terms the registrar publishes.
2. `import-buildings`: the dataset into `schedule_builder.buildings`.
3. `reconcile-term-<period>` for each term: the CSV is **streamed** through
   compact collectors (never held whole), then written in one short transaction
   with a 15 s `lock_timeout` and a 30 s `idle_in_transaction_session_timeout`.
4. `record-run`, then `record-heartbeat` when everything passed.

Inside each term's transaction the **invariants** run
(`src/scrape/invariants.ts`): the section count fell at most 15% (a rise is reported, never blocks: a term
the registrar is still filling in must not stall its own refresh), every active
section has a meeting, no unreadable times, every building exists, every section
missing from the feed is flagged cancelled. One that fails rolls the term back.
The heartbeat row (`platform."jobHeartbeats"`, job `schedule-builder-scrape`) is
written only when every term passed, so a failing scrape makes the platform's
daily-jobs check go overdue and Sentry alert. The full per-term report, building
coverage included, is kept in `uga."scrapeRuns"`.

If a human has looked at a 20% drop and says it is real:

```bash
wrangler workflows trigger production-catalog-scrape '{"skipInvariants":["sectionCountStable"]}'
```

Parameters: `terms` (academic periods, for a limited run that writes no
heartbeat) and `skipInvariants`.

## Develop

```bash
pnpm -F catalog test                  # unit and contract tests, no database
pnpm -F catalog test:db               # needs DB_URL, see below
pnpm -F catalog check:buildings       # the CI check on data/buildings
pnpm -F catalog dev                   # wrangler dev; DB_URL in .dev.vars
pnpm -F catalog populate:courses      # scrape into DB_URL, prints a report
pnpm -F catalog populate:buildings    # import the building dataset into DB_URL
```

`DB_URL` is an admin connection to a Postgres with Supabase's roles, for example
the local stack's `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Each
`*.db-test.ts` file builds a throwaway database on that server from
`supabase/schemas`, so it never touches data in the database `DB_URL` names.

`test/db/contract.db-test.ts` is the contract: every endpoint through the real
router and the real read-only role, each body validated against the schemas in
the OpenAPI file. `test/live/contract.live-test.ts` runs the same checks against
a deployed catalog:

```bash
CATALOG_URL=https://api-staging.devdogsuga.org/catalog/v1 pnpm -F catalog test:live
CATALOG_TEST_RATE_LIMIT=1 ...   # also trips the 429 (the address is limited for a minute)
```

## Deploy

Deployed Workers are `staging-catalog` and `production-catalog` (`wrangler.jsonc`),
on the zone routes `api(-staging).devdogsuga.org/catalog/v1/*` only: no
`workers.dev` name and no preview URLs around the rate limiter and the cache. They
share the platform's Hyperdrive configuration, so they read and write the same
Supabase project. The one optional Worker secret is `PLATFORM_SENTRY_DSN`
(the catalog reports to the platform's Sentry project, tagged `worker:catalog`);
`SENTRY_RELEASE` is passed as a `--var`.

The pipeline deploys it, through the shared `deploy-worker.yaml` like the other
Workers: `.github/workflows/deploy.yaml` has a `staging-catalog` job and a
`production-catalog` job that runs **before** the platform and schedule-builder
(this commit's platform and schedule-builder no longer run the scrape or the
Bulletin sync, so the catalog's Workflows must exist first; both wait on it).
`devtools check workers` fails CI if `workers.json` and those calls disagree.
The smoke test is `smoke.json` (`/terms` answers 200, a malformed term 400)
against the pinned version and then what is live, and after the switch
`pnpm -F catalog test:smoke` asks the deployed Worker for the headers too (CORS,
cache, a 405 for a write). Both pass on an empty database. The production smoke
is gated by the repository variable `CATALOG_PRODUCTION_ROUTED=true`, which is set
when `api.devdogsuga.org` is proxied in the zone; until then the Worker deploys
and switches without it.

A Worker that does not exist yet has no serving version to preview beside, so its
first deploy needs `mode: full`: set the repository variable
`CATALOG_DEPLOY_MODE` to `full` for that run (staging and production each have
a first deploy), and delete it afterwards so the next deploys preview first.

By hand, for a rehearsal or a fix:

```bash
backstage deploy catalog --tier staging --yes   # needs CLOUDFLARE_API_TOKEN
wrangler workflows trigger staging-catalog-scrape '{"terms":[202702]}' --env staging
CATALOG_URL=https://api-staging.devdogsuga.org/catalog/v1 pnpm -F catalog test:live
```

Staging has no schedule, so the registrar is not scraped from two environments.
`api.devdogsuga.org` is Supabase's custom domain for the platform project until the
Gate's cutover; the production route does nothing until that record is proxied
in the zone.

## Where things are

| Concern                           | Where                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| The contract                      | `openapi/catalog.yaml`                                                        |
| Caps, limits, cache lifetimes     | `src/api/limits.ts` (a test compares them with the spec and `wrangler.jsonc`) |
| Routes and the request pipeline   | `src/api/router.ts`, `src/api/params.ts`                                      |
| The SQL                           | `src/api/queries.ts`                                                          |
| The read-only connection          | `src/db/reader.ts`                                                            |
| The scrape                        | `src/scrape/`                                                                 |
| The Bulletin sync                 | `src/programs/`                                                               |
| Building dataset and its CI check | `data/buildings/`, `src/buildings/`, `scripts/check-buildings.ts`             |
| The `uga` schema                  | `supabase/schemas/uga/`, migrations 62 and 63                                 |
