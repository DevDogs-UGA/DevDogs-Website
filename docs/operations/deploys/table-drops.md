---
name: Dropping tables
description: The procedure for removing a table from production - archive, remove the code, wait one deploy, drop through the destructive gate - used for the Teams and competitions tables.
order: 5
section: infrastructure
---

# Dropping tables

Dropping a table is the most destructive thing the pipeline does, and it is the reason the destructive gate exists. This is the procedure; the Teams and competitions tables follow it. It takes **two deploys on purpose**.

## Why two deploys

Production applies database changes **before** it deploys the Workers. If one commit removes the code that reads a table and also drops the table, there is a window in which the old Worker (still serving) queries a table that is gone. A rollback of the Worker afterwards would be pointing at a missing table. So the table goes **one deploy after the last code that reads it**.

## Steps

1. **Archive first.** Export every row you may ever want to JSON in `archive/`, with a note of the date and the query. If rows hold personal data, keep the export in a private location instead and write that down in the pull request. Row counts of the export must match the live table; the pull request says both numbers.
2. **Remove the code.** One pull request deletes every reader and writer, plus the routes, jobs and docs. Merge it and let it deploy to staging and production **fully**, including the Workers.
3. **Check nothing still reads it.** The Supabase logs for the table, and Sentry for `relation ... does not exist` on staging, which has run the code for a while.
4. **Remove the table from the schema tree.** A second pull request deletes the table's file under `supabase/schemas/`. Its checks show `DROP TABLE` and fail until a `devops` member reads the SQL and adds the `allow-destructive` label ([Destructive changes](./destructive-changes.md)).
5. **Merge it.** Staging deploys first and asks the `staging-destructive` environment for approval. Read the plan in the run summary: it should contain **only** the expected `DROP TABLE` statements (and the dependent policies and indexes that go with them). Anything else means the tree and the database disagree; stop and find out why.
6. **Approve production** the same way: `production` for the plan, `production-destructive` for the drop. The approvers are not the author.
7. **Confirm.** The next scheduled smoke run is green, and the schema plan on the next deploy is empty.

## Rules of thumb

- A plan that drops more than you wrote is a stop, not a nudge. Do not approve "the drift".
- Never combine a drop with unrelated changes in the same pull request. The reviewer is reading the SQL for one purpose.
- A table with foreign keys from tables you are keeping needs those constraints removed in step 2, with the code, not in step 4.
- There is no undo. The archive is the undo. Keep it for as long as the club would want the data.
