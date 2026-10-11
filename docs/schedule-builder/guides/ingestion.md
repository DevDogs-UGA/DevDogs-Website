---
name: Ingestion
description: Where registrar data comes from now — the catalog Worker scrapes it, and the schedule builder reads what it wrote. How a scrape runs, what it checks, and why offerings are cancelled rather than deleted.
order: 2
section: guides
---

# Ingestion

The app plans against real UGA registrar data, and that data has to be pulled
in, parsed, and reconciled into Postgres before the generator has anything to
work with. Ingestion and [generation](./generation.md) are two independent
pipelines that meet only at the database — the generator never scrapes.

> [!NOTE]
> **The scrape no longer lives in this app.** It moved to the catalog Worker,
> `apps/catalog`, which owns everything scraped from UGA's sites and serves it to
> DogDays, DogPack and anything else over the public catalog API
> (`api.devdogsuga.org/catalog/v1`). Schedule-builder still reads the same
> `schedule_builder` tables the scrape writes; it just does not write them. The
> catalog's own README has the full account: `apps/catalog/README.md`.

## What triggers it

The catalog Worker's `ScrapeWorkflow` (`apps/catalog/src/scrape/ScrapeWorkflow.ts`),
a Cloudflare Workflow. A Workflow gets durable, retryable steps; in production it
fires on a **native Workflow schedule** (`"5 14 * * *"`, on the `SCRAPE_WORKFLOW`
binding in the catalog's `wrangler.jsonc`). Staging and development have no
schedule, so the registrar is not scraped from two environments at once; start
a run by hand.

## Populate course data

A fresh database has no courses, so the generator has nothing to plan against.
Run the scrape from the command line against whichever database `DB_URL` names.
It reads UGA's live feeds and prints a report (counts, every invariant, building
coverage, peak memory):

```bash
pnpm devtools supabase start && pnpm devtools supabase db reset   # local stack, once
pnpm -F schedule-builder populate:courses                          # runs the catalog's scrape
```

`populate:courses` hands over to `pnpm -F catalog populate:courses`
(`apps/catalog/scripts/scrape-local.ts`). It takes `--terms 202702,202608` to
limit the run, and `--record` to write the run to `uga."scrapeRuns"` and the
heartbeat.

To run it as the Workflow runs, in workerd, start the catalog and trigger the
instance:

```bash
pnpm -F catalog dev          # wrangler dev, with DB_URL in apps/catalog/.dev.vars
curl -X POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/workflows/development-catalog-scrape/instances \
  -H 'Content-Type: application/json' -d '{"params":{"terms":[202702]}}'
```

## The pipeline

1. **Discover terms.** `detectAvailableTerms()` fetches the per-semester CSVs;
   `fetchPartsOfTerm` fetches the registrar's calendars. HTML is parsed with
   `cheerio`. The CSV is **streamed**, never held whole: the old scrape kept every
   row in memory and hit the Worker's memory limit every day.

2. **Reconcile each term.** `reconcileTerm` (`apps/catalog/src/scrape/parsers/reconcileTerm.ts`)
   is the heart of it, and it runs **per term in its own short transaction**. A
   set of `*Collector` classes each `collect(row)` as rows stream past, then
   `flush(tx)` in **foreign-key dependency order**: subjects, colleges, campuses,
   schedule types, instructors and buildings first, then departments, courses,
   offerings and meetings. Each flush returns an id-map a later collector uses.
   Writes go through `bulkUpsert` — upserts, not inserts, so a re-scrape updates
   in place.

3. **Check the invariants.** Before the transaction commits, the term is checked
   (the section count moved at most 15%, every active section has a meeting, no
   unreadable times, every building exists, every missing section is flagged
   cancelled). A term that fails is rolled back, not published, and the
   heartbeat is not written, so the platform's daily-jobs check goes overdue and
   Sentry alerts.

4. **Cancel, never delete.** An offering that has vanished from the registrar is
   marked `cancelled`, not removed. Saved plans reference offerings by **CRN**;
   deleting one would tear a row out from under a student's saved schedule. A
   cancelled offering stays queryable and is simply filtered out of new results.

## A different "sync"

`src/lib/sync/mergeLocalData.ts` is unrelated to the registrar scrape despite
living next door. It runs on sign-in and copies a signed-out visitor's
`localStorage` drafts and plans into their freshly authenticated account
(`runLocalDataMerge`). If you are looking for where course data lands, that is
`reconcileTerm` in the catalog, not here.

## Where to look

| Concern                              | File                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| The scrape Workflow and its schedule | `apps/catalog/src/scrape/ScrapeWorkflow.ts`, `apps/catalog/wrangler.jsonc`  |
| One term, start to finish            | `apps/catalog/src/scrape/runTerm.ts`                                        |
| Term + calendar discovery            | `apps/catalog/src/scrape/parsers/AvailableTerms.ts`, `PartOfTermScraper.ts` |
| Reconcile + collectors               | `apps/catalog/src/scrape/parsers/reconcileTerm.ts`                          |
| The invariants                       | `apps/catalog/src/scrape/invariants.ts`                                     |
| The public catalog API               | `apps/catalog/openapi/catalog.yaml`, `apps/catalog/src/api/`                |
