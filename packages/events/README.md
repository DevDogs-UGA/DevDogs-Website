# @devdogsuga/events

Config-as-code for the club's meetings and workshops: a Zod schema, a
publishability validator, and the authored data itself
(`data/meetings.json`).

```ts
import { getClubConfig } from "@devdogsuga/events";

const config = getClubConfig(); // parses + validates data/meetings.json, or throws
```

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
  valid file's *content* can go on a public page — a summary that fits its
  card, an RSVP link on an allowlisted host. Run separately from the schema
  so a shape error and a publishability error are never confused for each
  other in CI output.

`getClubConfig()` (and `parseClubConfig()`, its in-memory counterpart) run
both steps in order and throw a readable `ClubConfigError` if either fails.

## `check` — the CI gate

```bash
pnpm --filter @devdogsuga/events check
```

Runs `getClubConfig()` against the committed `data/meetings.json` and prints
a pass/fail summary. This is the only place a config author gets a readable
validation error — the runtime reader trusts what it parses and refuses to
partially apply a bad file rather than re-validating field by field. Wired
into `.github/workflows/ci.yaml` as a merge-blocking step, matching how it
gates merges in the product repo.

## Consumers

`DevDogsUGA`'s platform app (`server/config/reconcile.ts`) and its
`packages/devtools` both import `@devdogsuga/events` for the published
config; `packages/events` no longer exists in that repo.
