---
name: Destructive changes
description: How a change that drops or rewrites data is stopped on the pull request and again at deploy time, who can let it through, and how to do it properly.
order: 4
section: infrastructure
---

# Destructive changes

Generated SQL may only add. A change that drops or rewrites data is stopped twice, and both stops are on purpose: the person who wrote it cannot be the one who lets it through, and the person who lets it through has to read the SQL.

## What counts

`.github/scripts/sql-classify.mjs` reads the SQL and flags `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, type changes, renames, `TRUNCATE`, `DELETE` and `UPDATE` (so a backfill needs the label too), and `DO` blocks (their bodies are not inspected). A dropped policy, view or function that is re-created in the same change is not a loss. Comments, strings and function bodies are not mistaken for statements. It reads two things:

- the SQL the **schema tree** adds on top of the committed migrations (removing a column from a file in `supabase/schemas/` makes the diff contain `DROP COLUMN`);
- every **hand-written migration** the pull request adds or edits.

## Stop one: the pull request

The `destructive-sql` check fails unless the pull request carries the **`allow-destructive`** label. The `destructive-gate` check fails if that label was applied by anyone who is not a `devops` member, which the check decides by repository permission: `maintain` (the `devops` team) or `admin` (the `admins` team). Admins are included because they can bypass the rulesets anyway; the gate keeps out everyone below them. The production deploy approvals are stricter, and name the `devops` team alone, read from the pull request's timeline so it is on record who did it. A label from anyone else is removed.

A new push to the pull request removes the label: it was applied to SQL someone read, and the SQL has changed since. A `devops` member applies it again after reading the new diff.

To let one through, as a `devops` member: open the **Checks** tab, read the `db-check` summary (the exact SQL, with the destructive statements listed), and only then add the label.

## Stop two: the deploy

A plan that is destructive does not apply on the ordinary approval. The database job first needs a deployment of **`production-destructive`** (staging: `staging-destructive`) approved by a `devops` member who did not write or queue the change. That environment holds no secrets; it exists only to be a second approval. Then the apply runs in `production`, and still refuses a plan whose hash is not the one approved.

If the job has no destructive environment configured, a destructive plan is refused outright.

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
