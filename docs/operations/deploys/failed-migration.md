---
name: A failed migration
description: What each database step leaves behind when it fails, how to tell, and how to get a deploy moving again without editing history.
order: 3
section: infrastructure
---

# A failed migration

The database job has four steps in two halves, and a failure in each leaves a different state. Work out which step failed from the run, then follow its section. The rule that governs all of them: **never edit a migration that any database has applied.** Fix forward with a new one.

## Which step failed

| Failed job            | Meaning                                                     | State of the database                                   |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `plan-migrations`     | The target could not be read, or a migration did not parse. | Untouched.                                              |
| `apply-migrations`    | `supabase db push` stopped at one migration.                | Earlier migrations applied; the failing one did not.    |
| `plan-schema`         | The declarative diff could not be generated.                | Untouched (the hand-written migrations may be in).      |
| `apply` (schema diff) | The diff failed, or the hash differed.                      | Untouched, unless the plan added an enum value (below). |

In the [one-approval flow](./one-approval.md) the same jobs run as `production-plan` (`plan-migrations`, `plan-schema`) and `production-database-apply` (`apply-migrations`, `apply`). One difference: when migrations are pending, the schema diff is planned inside `apply`, after they are in, so a diff that could not be generated or that is destructive without a pull request approval fails `apply`, with the migrations already applied.

Each migration file runs in its own transaction, so a failing file leaves nothing half-applied. The declarative diff is one transaction for the whole change, with one exception: Postgres will not let a statement use an enum value in the transaction that added it, so the diff is cut after each run of `ALTER TYPE ... ADD VALUE` and the later statements run in the next transaction. A plan with an added enum value is therefore applied in two or more transactions (the job summary says how many), and a failure after the first leaves the new value in place and the later statements not applied. Re-run the deploy: the next plan contains only what is left, because the diff is computed against the database as it now is.

## The hash differed

`the plan changed since it was approved` is the safety working, not a failure to fix. Between the plan you read and the apply, either the database moved (someone applied something) or the diff is not reproducible. Nothing was applied. Re-run the deploy; it plans again and asks you to approve the new plan. If it keeps differing with nobody else touching the database, stop and ask: that is a bug in the diff.

## A hand-written migration failed

1. Read the error in the job log. It names the statement. (The job log carries both the CLI's progress lines and its error, which the CLI writes to a different stream; if a log ends at "Connecting to remote database...", that is a bug in the script, not the reason.)
2. Reproduce it locally: `pnpm devtools supabase start`, then apply the migrations from scratch. The pull request check does exactly this, so a failure that passed CI usually means production data the test database lacks (a duplicate in a column you made unique, a row a new constraint rejects).
3. Write a **new** migration that makes the change safe (clean the data first, then constrain) and delete the failed one **only if no database has recorded it**. Production records a migration only after it succeeds, so a failed one is not recorded there; staging might have it. Check both before deleting.
4. If staging recorded a migration you then changed, repair its history instead of editing:

```sh
supabase migration repair --db-url "$STAGING_DB_URL" --status reverted <version>
```

and apply the corrected file.

## The schema diff failed

The diff is generated from `supabase/schemas/`. A failure there is almost always the tree asking for something the live data forbids (a new `NOT NULL` column with no default on a populated table). Change the tree to an additive form, or move the change into a hand-written migration that backfills first. Destructive changes follow [Destructive changes](./destructive-changes.md).

## When production is wrong and staging is fine

Do not "fix" production by hand. A hand edit makes the next plan try to undo it, or worse, hides it. Make the change as a migration, deploy it, and let the plan show you the effect. The only exception is an outage that needs a one-line fix right now; if you must, say so in the incident issue and put the same change in a migration the same day.
