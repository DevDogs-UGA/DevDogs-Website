---
name: Destructive changes
description: How a change that drops or rewrites data is stopped on the pull request and again at deploy time, who can let it through, and how to do it properly.
order: 4
section: infrastructure
---

# Destructive changes

Generated SQL may only add. A change that drops or rewrites data is stopped twice, and both stops are on purpose: the person who wrote it cannot be the one who lets it through, and the person who lets it through has to read the SQL.

## What counts

`.github/scripts/sql-classify.mjs` reads the SQL and flags `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, type changes, renames, `TRUNCATE`, `DELETE` and `UPDATE` (so a backfill needs the label too), an upsert (`INSERT ... ON CONFLICT ... DO UPDATE` overwrites rows like `UPDATE`), `EXPLAIN ANALYZE` of a data change (it really runs), and `DO` blocks (their bodies are not inspected). The one `DO` block that passes is the idiom for creating a role that may not exist: `IF NOT EXISTS (SELECT ... FROM pg_roles ...) THEN CREATE ROLE ...` and nothing else in the block. Prefer a plain `CREATE ROLE` in a migration anyway; a role is created once, and a migration runs once. A dropped policy, view or function that is re-created in the same change is not a loss. Comments, strings and function bodies are not mistaken for statements. It reads two things:

- the SQL the **schema tree** changes compared with where the pull request started (removing a column from a file in `supabase/schemas/` makes the diff contain `DROP COLUMN`). The check builds a scratch database at the base commit and another at the head, and reads the SQL between them;
- every **hand-written migration** the pull request adds, edits or renames;
- every **seed file** under `supabase/seed/` it adds or edits (and `supabase/roles.sql`). `include_seed` runs seeds on staging and production, and seeds are insert only, so a seed that updates, deletes, drops, alters or upserts is destructive. A `DO` block in a seed is read rather than distrusted (the officer seeds use one): it passes unless its body does one of those things or runs dynamic SQL (`EXECUTE`). The deploy plan classifies the seed files it is about to run the same way, so a seed cannot skip the gate by not being a migration.

## Stop one: the pull request

The `destructive-sql` check fails unless the pull request carries the **`allow-destructive`** label. The `destructive-gate` check fails if that label was applied by anyone who is not a `devops` member, which the check decides by repository permission: `maintain` (the `devops` team) or `admin` (the `admins` team). Admins are included because they can bypass the rulesets anyway; the gate keeps out everyone below them. The production deploy approvals are stricter, and name the `devops` team alone, read from the pull request's timeline so it is on record who did it. A label from anyone else is removed.

A new push to the pull request removes the label: it was applied to SQL someone read, and the SQL has changed since. The check does not trust a label it sees on a push for the same reason (removing a label with the workflow token starts no new run), so a destructive pull request stays red after each push until a `devops` member reads the new diff and applies the label again.

To let one through, as a `devops` member: open the **Checks** tab, read the `db-check` summary (the exact SQL, with the destructive statements listed), and only then add the label.

## Stop two: the deploy

Production's own approval is a separate, weaker step: it is not enough for a destructive plan. The database job first needs a deployment of **`production-destructive`** (staging: `staging-destructive`) approved by a `devops` member who did not write or queue the change. That environment holds no secrets; it exists only to be a second approval. Then the apply runs in `production`, and still refuses a plan whose hash is not the one approved.

If the job has no destructive environment configured, a destructive plan is refused outright.

**The approver cannot be the person who pushed.** The destructive environments block self-review, and a push to `main` is attributed to whoever pushed it. If you pushed, a different `devops` member has to approve the run, so a destructive change should not merge when nobody else is available. It is also a reason to keep migrations non-destructive where you can: a plain statement, not a `DO` block, wherever one will do.

## Doing it properly

Prefer two deploys over one:

1. Ship the code that no longer reads the thing, and let it run.
2. Then ship the removal. The removal is the destructive change.

Production applies migrations **before** it deploys the Workers, so a column dropped in the same commit as the code that stops reading it breaks the old code in the gap. [Dropping tables](./table-drops.md) walks through this for whole tables.

Take a copy of anything you cannot recreate first: export the rows to JSON in the repository's `archive/` folder (or a private release asset if they hold personal data), and say where in the pull request.

<details>
<summary>Why a label and an environment, not just one?</summary>

The label is a review of the **SQL as proposed**, before it merges. The environment is a review of the **plan as computed against the real database**, which can differ: a data-dependent diff, a database that moved. Each catches what the other cannot. The label can be applied before the plan exists; the plan cannot be approved before it is generated.

</details>
