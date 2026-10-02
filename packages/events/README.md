# @devdogsuga/events

Config-as-code for the club's meetings and workshops and the check-in
survey's questions: Zod schemas, a publishability validator, and the authored
data itself (`src/data/meetings.json`, `src/data/questions.json`).

```ts
import { getClubConfig } from "@devdogsuga/events";

const config = getClubConfig(); // parses + validates src/data/meetings.json, or throws
```

## Editing the data files

Each data file names its JSON Schema in `$schema`
(`src/data/meetings.schema.json`, `src/data/questions.schema.json`), so VS
Code, JetBrains and other JSON-aware editors complete keys and choices, show
each field's description on hover, and flag a misspelled key or an
over-long title as you type. Both schemas are generated from the Zod schemas
below; after changing one, run

```bash
pnpm --filter @devdogsuga/events schemas
```

(a test fails when the committed files drift). The editor catches shape
mistakes only; rules across fields or files (`endsAt` after `startsAt`, a
meeting listing a question that exists) are `check:events`'s.

Every meeting has a `slug`: its address on the platform (`/events/<slug>`)
and the URL printed on its posters. It is the meeting's Eastern date
(`2026-10-14`), plus a lowercase descriptor when another meeting shares the
date (`2026-10-05-judging` and `2026-10-05-workshop`). `check:events` refuses
a duplicate slug or one whose date isn't the meeting's own. Changing a slug
changes a URL people may already have, so set it once.

`questions.json` holds every survey question (`src/questions.ts`). A
`member` question is one answer per person, asked until answered and then
editable; a `meeting` question is asked at each meeting whose `questions`
lists its id. Ids are permanent once answered: retire a question or option
rather than deleting it.

## Two kinds of "is this config good"

- **`schema.ts`** is the STRUCTURAL half: does a file have the right shape
  and types. It mirrors the `meetings` and `workshops` columns the product
  actually reads today, minus everything that exists only for a synced wire
  format (foreign record ids, sync-status bookkeeping, attendance counts) —
  config has no such plumbing. Its length/host constants (e.g.
  `MEETING_SUMMARY_MAX_LENGTH`, `RSVP_URL_ALLOWED_HOSTS`) are duplicated
  from, and must never be looser than, the check constraints in the
  product's own `supabase/migrations/*_platform_events_core.sql` — config is
  upstream of Postgres, so a file this schema accepts must always be a row
  Postgres accepts too.
- **`validator.ts`** is the PUBLISHABILITY half: whether a structurally
  valid file's _content_ can go on a public page — a summary that fits its
  card, an RSVP link on an allowlisted host. Run separately from the schema
  so a shape error and a publishability error are never confused for each
  other in CI output.

`getClubConfig()` (and `parseClubConfig()`, its in-memory counterpart) run
both steps in order and throw a readable `ClubConfigError` if either fails.

## `check` — the CI gate

```bash
pnpm --filter @devdogsuga/events check:events
```

Checks the committed `src/data/meetings.json` and `src/data/questions.json`, each against its schema and then together, and prints
a pass/fail summary. This is the only place a config author gets a readable
validation error — the runtime reader trusts what it parses and refuses to
partially apply a bad file rather than re-validating field by field. Wired
into `.github/workflows/ci.yaml` as a merge-blocking step, matching how it
gates merges in the product repo.

## Consumers

`DevDogsUGA`'s platform app (`server/config/reconcile.ts`) and its
`packages/devtools` both import `@devdogsuga/events` for the published
config; `packages/events` no longer exists in that repo.
