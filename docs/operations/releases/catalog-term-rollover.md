---
name: Catalog term rollover
description: What to do when UGA publishes a new term - checking the scrape found it, comparing it with the term before, and what a scrape that runs out of memory looks like.
order: 2
section: infrastructure
---

# Catalog term rollover

The catalog Worker reads the registrar's published course data daily and keeps one set of tables per term. When UGA opens a new term (Fall, Spring, Summer) it appears as a new row in `schedule_builder.terms`, and DogDays shows it as an option. Do this check each time a term opens - Fall 2027 is the next - and any day the scrape alerts.

## Check that the term arrived

1. **The term exists:** `terms` has a row for it, and the catalog's available-terms response lists it. Read-only SQL is enough: the term code, its start and end dates, and the number of `partsOfTerm`.
2. **The counts are plausible.** Compare offerings and meetings with the same season a year earlier, and with the term before it. A new term starts small and grows as departments publish; a term at _less than half_ of its predecessor a week after it opens is worth a look, one that grows day over day is fine. Cancelled sections are counted separately and are not a defect.
3. **Locations.** Many meetings show the location TBA until rooms are assigned. That is the registrar, not the scrape.
4. **Freshness.** Every section's `lastSeen` should be within the last day or two. Sections not seen for longer have left the registrar's feed.

## Buildings

Meetings join to buildings on the **integer** building code (the registrar's `0024` is stored as `24`). A building with no coordinates shows on the list but cannot be mapped. When the coverage drops (new campus buildings), the catalog's building data has a gap file and a check that lists the missing ones by meeting count; add the biggest first. Coordinates are checked per campus (Athens, Griffin and Tifton are far apart), so a building belongs in its own campus's file.

## When the scrape fails

The daily scrape is a Workflow with one step per term. Read a failed run with `wrangler workflows instances describe` (the staging and production workflow names are `staging-catalog-scrape` and `production-catalog-scrape`), which shows each attempt.

The failure to know about: **the Worker exceeding its memory limit**. An attempt that dies with `Worker exceeded memory limit` abandons its database transaction, and the abandoned transaction keeps its row locks. The retry then waits on those locks until the statement timeout (120 seconds), fails the same way, and the next retry is blocked again. If you see attempts alternating between "memory limit" and a timeout on an `INSERT`, the cause is the first, not the timeout. The fix is less memory per step (smaller chunks, drop raw rows once collected, one term per step), and a short `lock_timeout` on the scraper's session so a blocked retry fails fast instead of waiting two minutes. Staging's scrape should complete with **no attempt** hitting the memory limit before you trust a change.

Trigger a staging run by hand, never from production:

```sh
wrangler workflows trigger staging-catalog-scrape '{"terms":[202702]}' --env staging
```

The scrape does not run on a schedule in staging, because it reads UGA's site from a shared address pool and two environments double the load that site sees.

## After the term opens

- Tell the DogDays team the term is selectable.
- Keep an eye on [Sentry](../incidents/sentry-triage.md) for the first week: a new term exposes data shapes the old ones did not.
